/**
 * E2E: offline reconciliation reports (quarantine + number-gaps + resolve).
 *
 * Proves: quarantine list (branch-scoped, resolved filter), bill-number gap
 * detection (seq 1,2,4 → missing 3), resolve marks handled + blocks re-resolve,
 * cashier forbidden. Real Postgres testcontainer.
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
const DAY = "2026-08-01";

describe("Offline reconciliation reports (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;

  let branchId: string;
  let hqToken: string;
  let cashierToken: string;
  let quarantinedBillId: string;

  const login = (u: string, p: string) => request(app.getHttpServer()).post("/auth/login").send({ username: u, password: p });

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "test-secret-off";
    process.env.JWT_REFRESH_SECRET = "test-refresh-off";
    process.env.REDIS_URL = "redis://localhost:6379";
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const branch = await prisma.branch.create({ data: { code: "OF01", name: "Offline", address: "a", phone: "0900000001" } });
    branchId = branch.id;
    await prisma.appUser.create({ data: { username: "hq-off", passwordHash: await argon2.hash("Password123"), role: "QUAN_TRI_HQ", chainWide: true, mustChangePassword: false } });
    const cashier = await prisma.appUser.create({ data: { username: "cashier-off", passwordHash: await argon2.hash("Password123"), role: "THU_NGAN", chainWide: false, mustChangePassword: false } });
    await prisma.userBranch.create({ data: { userId: cashier.id, branchId } });
    const shift = await prisma.shift.create({ data: { branchId, deviceId: "dev-x", businessDate: new Date(`${DAY}T00:00:00Z`), status: "CLOSED", openedBy: "seed", openingCashVnd: 0 } });

    const mk = (seq: number, quarantined: boolean, reason?: string) =>
      prisma.bill.create({
        data: {
          number: `OF-${seq}`,
          seq,
          branchId,
          shiftId: shift.id,
          deviceId: "dev-x",
          businessDate: new Date(`${DAY}T00:00:00Z`),
          status: "COMPLETED",
          createdBy: "seed",
          totalVnd: 100_000,
          guestCount: 1,
          quarantined,
          quarantineReason: reason,
        },
      });
    // seq 1,2,4 (missing 3). seq 4 is quarantined.
    await mk(1, false);
    await mk(2, false);
    const q = await mk(4, true, "clock_skew");
    quarantinedBillId = q.id;

    hqToken = (await login("hq-off", "Password123")).body.accessToken;
    cashierToken = (await login("cashier-off", "Password123")).body.accessToken;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it("lists quarantined bills", async () => {
    const res = await request(app.getHttpServer()).get(`/sales/reports/quarantine?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${hqToken}`).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].quarantineReason).toBe("clock_skew");
  });

  it("detects the missing bill number (seq gap)", async () => {
    const res = await request(app.getHttpServer()).get(`/sales/reports/number-gaps?branchId=${branchId}&businessDate=${DAY}`).set("Authorization", `Bearer ${hqToken}`).expect(200);
    expect(res.body.missing).toEqual([3]);
    expect(res.body.min).toBe(1);
    expect(res.body.max).toBe(4);
  });

  it("resolves a quarantined bill, then blocks re-resolve", async () => {
    await request(app.getHttpServer()).post(`/sales/reports/quarantine/${quarantinedBillId}/resolve`).set("Authorization", `Bearer ${hqToken}`).send({ note: "đã kiểm tra" }).expect(201);
    const bill = await prisma.bill.findUnique({ where: { id: quarantinedBillId } });
    expect(bill!.quarantineResolvedAt).not.toBeNull();
    expect(bill!.quarantineResolveNote).toBe("đã kiểm tra");

    await request(app.getHttpServer()).post(`/sales/reports/quarantine/${quarantinedBillId}/resolve`).set("Authorization", `Bearer ${hqToken}`).send({ note: "again" }).expect(403);

    // resolved filter surfaces it
    const res = await request(app.getHttpServer()).get(`/sales/reports/quarantine?resolved=true`).set("Authorization", `Bearer ${hqToken}`).expect(200);
    expect(res.body.total).toBe(1);
  });

  it("a cashier is forbidden", async () => {
    await request(app.getHttpServer()).get(`/sales/reports/quarantine`).set("Authorization", `Bearer ${cashierToken}`).expect(403);
  });
});
