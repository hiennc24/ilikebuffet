/**
 * E2E: audit-trail read endpoint (Nhật ký).
 *
 * Proves: role gate (HQ + branch manager only; cashier 403), branch-scoping
 * (a manager sees only their branch's events), action filter, and { data, total }.
 * Real Postgres testcontainer (Docker up required).
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as argon2 from "argon2";
import request from "supertest";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCHEMA = join(REPO_ROOT, "prisma", "schema.prisma");

describe("Audit query (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;

  let branchAId: string;
  let branchBId: string;
  let hqUserId: string;
  let hqToken: string;
  let managerAToken: string;
  let cashierToken: string;

  const login = (username: string, password: string) =>
    request(app.getHttpServer()).post("/auth/login").send({ username, password });

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "test-secret-audit-q";
    process.env.JWT_REFRESH_SECRET = "test-refresh-audit-q";
    process.env.REDIS_URL = "redis://localhost:6379";

    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], {
      env: { ...process.env, DATABASE_URL: db.url },
      stdio: "inherit",
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const [a, b] = await Promise.all([
      prisma.branch.create({ data: { code: "AQ01", name: "Audit A", address: "a", phone: "0900000001" } }),
      prisma.branch.create({ data: { code: "AQ02", name: "Audit B", address: "b", phone: "0900000002" } }),
    ]);
    branchAId = a.id;
    branchBId = b.id;

    const hq = await prisma.appUser.create({
      data: { username: "hq-a", passwordHash: await argon2.hash("Password123"), role: "QUAN_TRI_HQ", chainWide: true, mustChangePassword: false },
    });
    hqUserId = hq.id;
    const mgr = await prisma.appUser.create({
      data: { username: "mgr-audit", passwordHash: await argon2.hash("Password123"), role: "QUAN_LY_CN", chainWide: false, mustChangePassword: false },
    });
    await prisma.userBranch.create({ data: { userId: mgr.id, branchId: branchAId } });
    const cashier = await prisma.appUser.create({
      data: { username: "cashier-audit", passwordHash: await argon2.hash("Password123"), role: "THU_NGAN", chainWide: false, mustChangePassword: false },
    });
    await prisma.userBranch.create({ data: { userId: cashier.id, branchId: branchAId } });

    // Seed audit rows for both branches (testcontainer role bypasses the append guard).
    await prisma.auditLog.createMany({
      data: [
        { action: "bill.create", objectType: "bill", objectId: "x1", branchId: branchAId, actorId: hqUserId, actorRole: "QUAN_TRI_HQ" },
        { action: "bill.cancel", objectType: "bill", objectId: "x1", branchId: branchAId },
        { action: "bill.create", objectType: "bill", objectId: "y1", branchId: branchBId },
      ],
    });

    hqToken = (await login("hq-a", "Password123")).body.accessToken;
    managerAToken = (await login("mgr-audit", "Password123")).body.accessToken;
    cashierToken = (await login("cashier-audit", "Password123")).body.accessToken;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it("HQ sees all branches' events with { data, total }", async () => {
    const res = await request(app.getHttpServer()).get("/audit?pageSize=50").set("Authorization", `Bearer ${hqToken}`).expect(200);
    const branchIds = new Set((res.body.data as { branchId: string }[]).map((r) => r.branchId));
    expect(branchIds.has(branchAId)).toBe(true);
    expect(branchIds.has(branchBId)).toBe(true);
    expect(typeof res.body.total).toBe("number");
  });

  it("resolves the actor id to a username for display", async () => {
    const res = await request(app.getHttpServer()).get("/audit?action=bill.create&pageSize=50").set("Authorization", `Bearer ${hqToken}`).expect(200);
    const rows = res.body.data as { actorId: string | null; actorName: string | null }[];
    const seeded = rows.find((r) => r.actorId === hqUserId);
    expect(seeded?.actorName).toBe("hq-a");
    // Rows without an actor resolve to null, never a dangling id.
    expect(rows.every((r) => (r.actorId ? r.actorName !== undefined : r.actorName === null))).toBe(true);
  });

  it("a branch manager sees only their branch's events", async () => {
    const res = await request(app.getHttpServer()).get("/audit?pageSize=50").set("Authorization", `Bearer ${managerAToken}`).expect(200);
    const rows = res.body.data as { branchId: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.branchId === branchAId)).toBe(true);
  });

  it("a cashier is forbidden", async () => {
    await request(app.getHttpServer()).get("/audit").set("Authorization", `Bearer ${cashierToken}`).expect(403);
  });

  it("action filter narrows the result", async () => {
    const res = await request(app.getHttpServer()).get("/audit?action=bill.cancel&pageSize=50").set("Authorization", `Bearer ${hqToken}`).expect(200);
    const rows = res.body.data as { action: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.action === "bill.cancel")).toBe(true);
  });

  it("exports a filtered .xlsx for HQ", async () => {
    const res = await request(app.getHttpServer())
      .get("/audit/export?action=bill.cancel")
      .set("Authorization", `Bearer ${hqToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain(".xlsx");
    // xlsx is a zip — the buffer starts with the "PK" magic bytes.
    expect((res.body as Buffer).subarray(0, 2).toString()).toBe("PK");
  });

  it("export is forbidden for a cashier", async () => {
    await request(app.getHttpServer()).get("/audit/export").set("Authorization", `Bearer ${cashierToken}`).expect(403);
  });
});
