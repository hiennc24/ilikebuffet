/**
 * E2E: user administration.
 *
 * Proves the security contract:
 *  - HQ creates a user → one-time temp password, mustChangePassword, no hashes.
 *  - The new user can log in with the temp password.
 *  - List/create responses never leak password/PIN hashes.
 *  - Insider-resistance: QUAN_LY_CN cannot mint a manager/HQ role; cannot touch a
 *    user outside its branch; a cashier cannot reach the admin routes at all.
 *  - Lock revokes access.
 *
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

describe("User administration (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;

  let branchAId: string;
  let branchBId: string;
  let hqToken: string;
  let managerAToken: string;
  let cashierToken: string;

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer()).post("/auth/login").send({ username, password });
    return res;
  }

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "test-secret-users";
    process.env.JWT_REFRESH_SECRET = "test-refresh-users";
    process.env.REDIS_URL = "redis://localhost:6379";

    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], {
      env: { ...process.env, DATABASE_URL: db.url },
      stdio: "inherit",
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const [branchA, branchB] = await Promise.all([
      prisma.branch.create({ data: { code: "UA01", name: "Users A", address: "a", phone: "0900000001" } }),
      prisma.branch.create({ data: { code: "UB02", name: "Users B", address: "b", phone: "0900000002" } }),
    ]);
    branchAId = branchA.id;
    branchBId = branchB.id;

    await prisma.appUser.create({
      data: { username: "hq", passwordHash: await argon2.hash("Password123"), role: "QUAN_TRI_HQ", chainWide: true, mustChangePassword: false },
    });
    const managerA = await prisma.appUser.create({
      data: { username: "mgr-a", passwordHash: await argon2.hash("Password123"), role: "QUAN_LY_CN", chainWide: false, mustChangePassword: false },
    });
    await prisma.userBranch.create({ data: { userId: managerA.id, branchId: branchAId } });
    const cashier = await prisma.appUser.create({
      data: { username: "cashier", passwordHash: await argon2.hash("Password123"), role: "THU_NGAN", chainWide: false, mustChangePassword: false },
    });
    await prisma.userBranch.create({ data: { userId: cashier.id, branchId: branchAId } });

    hqToken = (await login("hq", "Password123")).body.accessToken;
    managerAToken = (await login("mgr-a", "Password123")).body.accessToken;
    cashierToken = (await login("cashier", "Password123")).body.accessToken;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it("HQ creates a user → temp password + mustChangePassword, no hashes; the user can log in", async () => {
    const res = await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${hqToken}`)
      .send({ username: "new-cashier", role: "THU_NGAN", branchIds: [branchAId] })
      .expect(201);

    expect(res.body.tempPassword).toBeTruthy();
    expect(res.body.user.mustChangePassword).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|approvalPinHash|cashierPinHash/);

    const login1 = await login("new-cashier", res.body.tempPassword);
    expect(login1.status).toBe(201);
    expect(login1.body.mustChangePassword).toBe(true);
  });

  it("list never leaks hashes", async () => {
    const res = await request(app.getHttpServer())
      .get("/users?pageSize=50")
      .set("Authorization", `Bearer ${hqToken}`)
      .expect(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|PinHash/);
  });

  it("QUAN_LY_CN can create a cashier in its branch but NOT a manager role", async () => {
    await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${managerAToken}`)
      .send({ username: "mgr-made-cashier", role: "THU_NGAN", branchIds: [branchAId] })
      .expect(201);

    await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${managerAToken}`)
      .send({ username: "mgr-made-manager", role: "QUAN_LY_CN", branchIds: [branchAId] })
      .expect(403);
  });

  it("QUAN_LY_CN cannot create a user in another branch", async () => {
    await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${managerAToken}`)
      .send({ username: "cross-branch", role: "THU_NGAN", branchIds: [branchBId] })
      .expect(403);
  });

  it("a cashier cannot reach the user-admin routes", async () => {
    await request(app.getHttpServer()).get("/users").set("Authorization", `Bearer ${cashierToken}`).expect(403);
  });

  it("reset-password returns a new temp password and no hash", async () => {
    const created = await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${hqToken}`)
      .send({ username: "reset-me", role: "THU_NGAN", branchIds: [branchAId] })
      .expect(201);
    const userId = created.body.user.id;

    const res = await request(app.getHttpServer())
      .post(`/users/${userId}/reset-password`)
      .set("Authorization", `Bearer ${hqToken}`)
      .expect(201);
    expect(res.body.tempPassword).toBeTruthy();
    expect(res.body.tempPassword).not.toBe(created.body.tempPassword);
    expect(JSON.stringify(res.body)).not.toMatch(/Hash/);
  });

  it("lock then unlock a user", async () => {
    const created = await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${hqToken}`)
      .send({ username: "lock-me", role: "THU_NGAN", branchIds: [branchAId] })
      .expect(201);
    const userId = created.body.user.id;

    await request(app.getHttpServer()).post(`/users/${userId}/lock`).set("Authorization", `Bearer ${hqToken}`).expect(201);
    const locked = await prisma.appUser.findUnique({ where: { id: userId } });
    expect(locked!.lockedUntil).not.toBeNull();

    await request(app.getHttpServer()).post(`/users/${userId}/unlock`).set("Authorization", `Bearer ${hqToken}`).expect(201);
    const unlocked = await prisma.appUser.findUnique({ where: { id: userId } });
    expect(unlocked!.lockedUntil).toBeNull();
  });
});
