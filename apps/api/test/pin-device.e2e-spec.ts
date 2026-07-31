/**
 * E2E: PIN + Device registry (H4, C3, dual-PIN, M1, M2, M3, M4).
 *
 * Proves:
 *  H4.1 PIN login from unregistered device → 403 (generic error — M2).
 *  H4.2 Valid device + valid cashier PIN → 201 + tokens.
 *  H4.3 Wrong device secret → 403 (generic error — M2).
 *  H4.4 Wrong PIN 5× → pinLockedUntil set (15min lock — H3 atomic).
 *  H4.5 Cashier of different branch cannot PIN-login on this device.
 *  C3   cashierPinHash ≠ approvalPinHash (separate columns).
 *       Approval PIN cannot be used for cashier quick-login.
 *       API responses never include PIN hashes.
 *  M1   setCashierPin → only THU_NGAN; setApprovalPin → only QUAN_LY_CN. 403 otherwise.
 *  M2   All pre-PIN failure paths return identical generic error message.
 *  M3   Device.status is DeviceStatus enum (ACTIVE/SUSPENDED); suspended device → 403.
 *  M4   Password-locked account cannot PIN-login even with correct PIN.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DeviceStatus } from "@prisma/client";
import * as argon2 from "argon2";
import request from "supertest";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";
import { DeviceService } from "../src/platform/devices/device.service";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCHEMA = join(REPO_ROOT, "prisma", "schema.prisma");

/** The generic message all pin-login failures must return (M2). */
const GENERIC_PIN_ERROR = "Invalid device or PIN";

describe("PIN + Device registry (H4, C3, dual-PIN, M1, M2, M3, M4)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let deviceSvc: DeviceService;

  let branchId: string;
  let cashierId: string;
  let managerId: string;
  let registeredDeviceId: string;
  let registeredDeviceSecret: string;

  // Tokens for M1 role-gate tests
  let cashierToken: string;
  let managerToken: string;
  let hqToken: string;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "test-jwt-secret-pin";
    process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-pin";
    process.env.REDIS_URL = "redis://localhost:6379";

    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], {
      env: { ...process.env, DATABASE_URL: db.url },
      stdio: "inherit",
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    deviceSvc = app.get(DeviceService);

    // Seed branch.
    const branch = await prisma.branch.create({ data: { code: "PDV1", name: "POS Branch 1" } });
    branchId = branch.id;

    const passwordHash = await argon2.hash("Password123");
    const cashierPinHash = await argon2.hash("111111");
    const approvalPinHash = await argon2.hash("999999");

    // Cashier — has both PIN types to prove separation.
    const cashier = await prisma.appUser.create({
      data: {
        username: "cashier-pin-test",
        passwordHash,
        role: "THU_NGAN",
        chainWide: false,
        mustChangePassword: false,
        tokenVersion: 0,
        cashierPinHash,
        approvalPinHash,
        branches: { create: { branchId } },
      },
    });
    cashierId = cashier.id;

    // Branch manager — for M1 approval-PIN gate test.
    const manager = await prisma.appUser.create({
      data: {
        username: "manager-pin-test",
        passwordHash,
        role: "QUAN_LY_CN",
        chainWide: false,
        mustChangePassword: false,
        tokenVersion: 0,
        branches: { create: { branchId } },
      },
    });
    managerId = manager.id;

    // HQ user — for M1 negative test (neither cashier nor manager).
    await prisma.appUser.create({
      data: {
        username: "hq-pin-test",
        passwordHash,
        role: "QUAN_TRI_HQ",
        chainWide: true,
        mustChangePassword: false,
        tokenVersion: 0,
      },
    });

    // Register a device.
    const reg = await deviceSvc.register({ branchId, label: "POS Terminal 1" });
    registeredDeviceId = reg.deviceId;
    registeredDeviceSecret = reg.secret;

    // Get tokens for M1 tests.
    cashierToken = (await auth.login({ username: "cashier-pin-test", password: "Password123" })).accessToken;
    managerToken = (await auth.login({ username: "manager-pin-test", password: "Password123" })).accessToken;
    hqToken = (await auth.login({ username: "hq-pin-test", password: "Password123" })).accessToken;

    void managerId;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  // ─── H4.1 + M2: unregistered device → 403 with generic message ───────────

  it("H4.1/M2: PIN login from unregistered device → 403, generic error", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/pin-login")
      .send({ deviceId: "completely-unknown-device-id", deviceSecret: "any", userId: cashierId, pin: "111111" })
      .expect(403);
    expect(res.body.message).toBe(GENERIC_PIN_ERROR);
  });

  // ─── H4.2: valid device + valid PIN → success ─────────────────────────────

  it("H4.2: valid device + correct cashier PIN → 201 + tokens", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/pin-login")
      .send({ deviceId: registeredDeviceId, deviceSecret: registeredDeviceSecret, userId: cashierId, pin: "111111" })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  // ─── H4.3 + M2: wrong device secret → 403 with generic message ───────────

  it("H4.3/M2: wrong device secret → 403, generic error", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/pin-login")
      .send({ deviceId: registeredDeviceId, deviceSecret: "wrong-secret", userId: cashierId, pin: "111111" })
      .expect(403);
    expect(res.body.message).toBe(GENERIC_PIN_ERROR);
  });

  // ─── H4.4 + H3: wrong PIN 5× → PIN locked ────────────────────────────────

  it("H4.4/H3: wrong PIN 5× → pinLockedUntil set, 6th attempt rejected", async () => {
    const passwordHash = await argon2.hash("Password123");
    const cashierPinHash = await argon2.hash("222222");
    const lockedCashier = await prisma.appUser.create({
      data: {
        username: "cashier-lockout-test",
        passwordHash,
        role: "THU_NGAN",
        chainWide: false,
        mustChangePassword: false,
        tokenVersion: 0,
        cashierPinHash,
        branches: { create: { branchId } },
      },
    });

    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .post("/auth/pin-login")
        .send({ deviceId: registeredDeviceId, deviceSecret: registeredDeviceSecret, userId: lockedCashier.id, pin: "000000" })
        .expect(401);
      // M2: wrong-PIN failure must use the generic error.
      expect(res.body.message).toBe(GENERIC_PIN_ERROR);
    }

    // 6th attempt with correct PIN — still locked.
    await request(app.getHttpServer())
      .post("/auth/pin-login")
      .send({ deviceId: registeredDeviceId, deviceSecret: registeredDeviceSecret, userId: lockedCashier.id, pin: "222222" })
      .expect(401);

    const updated = await prisma.appUser.findUnique({ where: { id: lockedCashier.id } });
    expect(updated!.pinLockedUntil).not.toBeNull();
    const lockMs = updated!.pinLockedUntil!.getTime() - Date.now();
    expect(lockMs).toBeGreaterThan(14 * 60 * 1000);
    expect(lockMs).toBeLessThan(16 * 60 * 1000);
  });

  // ─── H4.5 + M2: cashier of wrong branch → 403 with generic message ────────

  it("H4.5/M2: cashier of different branch → 403, generic error", async () => {
    const branch2 = await prisma.branch.create({ data: { code: "PDV2", name: "POS Branch 2" } });
    const passwordHash = await argon2.hash("Password123");
    const cashierPinHash = await argon2.hash("333333");
    const otherCashier = await prisma.appUser.create({
      data: {
        username: "cashier-other-branch",
        passwordHash,
        role: "THU_NGAN",
        chainWide: false,
        mustChangePassword: false,
        tokenVersion: 0,
        cashierPinHash,
        branches: { create: { branchId: branch2.id } },
      },
    });

    const res = await request(app.getHttpServer())
      .post("/auth/pin-login")
      .send({ deviceId: registeredDeviceId, deviceSecret: registeredDeviceSecret, userId: otherCashier.id, pin: "333333" })
      .expect(403);
    expect(res.body.message).toBe(GENERIC_PIN_ERROR);
  });

  // ─── M4: password-locked account cannot PIN-login ─────────────────────────

  it("M4: account with lockedUntil set cannot PIN-login even with correct PIN", async () => {
    const passwordHash = await argon2.hash("Password123");
    const cashierPinHash = await argon2.hash("444444");
    const futureDate = new Date(Date.now() + 15 * 60 * 1000);

    const lockedUser = await prisma.appUser.create({
      data: {
        username: "cashier-pw-locked",
        passwordHash,
        role: "THU_NGAN",
        chainWide: false,
        mustChangePassword: false,
        tokenVersion: 0,
        cashierPinHash,
        lockedUntil: futureDate, // password-locked
        branches: { create: { branchId } },
      },
    });

    const res = await request(app.getHttpServer())
      .post("/auth/pin-login")
      .send({ deviceId: registeredDeviceId, deviceSecret: registeredDeviceSecret, userId: lockedUser.id, pin: "444444" })
      .expect(401);
    expect(res.body.message).toBe(GENERIC_PIN_ERROR);
  });

  // ─── M3: DeviceStatus enum — suspended device is denied ──────────────────

  it("M3: suspended device → 403, generic error", async () => {
    const reg = await deviceSvc.register({ branchId, label: "Terminal to suspend" });
    await deviceSvc.suspend(reg.deviceId);

    // Verify DB has the enum value SUSPENDED (not the string "suspended").
    const device = await prisma.device.findUnique({ where: { deviceId: reg.deviceId } });
    expect(device!.status).toBe(DeviceStatus.SUSPENDED);

    const res = await request(app.getHttpServer())
      .post("/auth/pin-login")
      .send({ deviceId: reg.deviceId, deviceSecret: reg.secret, userId: cashierId, pin: "111111" })
      .expect(403);
    expect(res.body.message).toBe(GENERIC_PIN_ERROR);
  });

  // ─── C3: Dual-PIN separation ──────────────────────────────────────────────

  it("C3: cashierPinHash and approvalPinHash stored in separate columns", async () => {
    const user = await prisma.appUser.findUnique({ where: { id: cashierId } });
    expect(user!.cashierPinHash).toBeDefined();
    expect(user!.approvalPinHash).toBeDefined();
    expect(user!.cashierPinHash).not.toBe(user!.approvalPinHash);
  });

  it("C3: approval PIN (999999) rejected for cashier quick-login", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/pin-login")
      .send({ deviceId: registeredDeviceId, deviceSecret: registeredDeviceSecret, userId: cashierId, pin: "999999" })
      .expect(401);
    expect(res.body.message).toBe(GENERIC_PIN_ERROR);
  });

  it("C3: API responses never include PIN hashes", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/pin-login")
      .send({ deviceId: registeredDeviceId, deviceSecret: registeredDeviceSecret, userId: cashierId, pin: "111111" })
      .expect(201);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("cashierPinHash");
    expect(body).not.toContain("approvalPinHash");
    expect(body).not.toContain("passwordHash");
  });

  // ─── M1: role-gated PIN setters ───────────────────────────────────────────

  it("M1: THU_NGAN can set cashier PIN via POST /auth/profile/cashier-pin", async () => {
    await request(app.getHttpServer())
      .post("/auth/profile/cashier-pin")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ pin: "555555" })
      .expect(201);
    // Verify the hash changed in DB.
    const user = await prisma.appUser.findUnique({ where: { id: cashierId } });
    const ok = await argon2.verify(user!.cashierPinHash!, "555555");
    expect(ok).toBe(true);
    // Reset to original for subsequent tests.
    await auth.setCashierPin(cashierId, "111111", "THU_NGAN");
  });

  it("M1: QUAN_LY_CN can set approval PIN via POST /auth/profile/approval-pin", async () => {
    await request(app.getHttpServer())
      .post("/auth/profile/approval-pin")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ pin: "666666" })
      .expect(201);
  });

  it("M1: HQ (QUAN_TRI_HQ) cannot set cashier PIN → 403", async () => {
    await request(app.getHttpServer())
      .post("/auth/profile/cashier-pin")
      .set("Authorization", `Bearer ${hqToken}`)
      .send({ pin: "777777" })
      .expect(403);
  });

  it("M1: HQ (QUAN_TRI_HQ) cannot set approval PIN → 403", async () => {
    await request(app.getHttpServer())
      .post("/auth/profile/approval-pin")
      .set("Authorization", `Bearer ${hqToken}`)
      .send({ pin: "888888" })
      .expect(403);
  });

  it("M1: THU_NGAN cannot set approval PIN → 403", async () => {
    await request(app.getHttpServer())
      .post("/auth/profile/approval-pin")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ pin: "123456" })
      .expect(403);
  });

  it("M1: QUAN_LY_CN cannot set cashier PIN → 403", async () => {
    await request(app.getHttpServer())
      .post("/auth/profile/cashier-pin")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ pin: "654321" })
      .expect(403);
  });
});
