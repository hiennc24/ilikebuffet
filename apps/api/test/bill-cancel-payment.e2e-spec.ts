/**
 * E2E: Bill payments + cancellation flows.
 *
 * Proves:
 *  (a) Payments:
 *      1. payments sum != bill.totalVnd → 400
 *      2. payments sum == bill.totalVnd → 201 + bill.paidAt set
 *      3. Paying an already-paid bill → 409
 *      4. Empty payments array → 400
 *
 *  (b) Cancellation:
 *      5. Cancel a bill whose shift is CLOSED → 403
 *      6. Happy path: cancel with valid manager PIN → bill CANCELLED, number retained
 *      7. Wrong device ID → 403
 *
 * Uses a real Postgres testcontainer (Docker up required).
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

describe("Bill payments + cancellation (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;

  // Seeded IDs
  let branchId: string;
  let deviceId: string;
  let openShiftId: string;
  let closedShiftId: string;
  let ticketTypeId: string;
  let cashierId: string;
  let managerId: string;
  let cashierToken: string;

  const MANAGER_PIN = "123456";

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "test-secret-cancel";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-cancel";
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

    // ── Branch ────────────────────────────────────────────────────────────────
    const branch = await prisma.branch.create({
      data: {
        code: "TC01",
        name: "Test Cancel Branch",
        address: "1 Test Ave",
        phone: "0900000002",
      },
    });
    branchId = branch.id;

    // ── Device ────────────────────────────────────────────────────────────────
    const device = await prisma.device.create({
      data: {
        branchId,
        secretHash: await argon2.hash("dev-secret"),
        label: "POS-CANCEL",
      },
    });
    deviceId = device.deviceId;

    // ── Ticket type ───────────────────────────────────────────────────────────
    const tt = await prisma.ticketType.create({
      data: { name: "Người lớn", isFree: false, displayOrder: 0 },
    });
    ticketTypeId = tt.id;

    // ── Time window (all day) ─────────────────────────────────────────────────
    const tw = await prisma.timeWindow.create({
      data: { name: "Cả ngày", startMinute: 0, endMinute: 1440, displayOrder: 0 },
    });

    // ── Price book ────────────────────────────────────────────────────────────
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const version = await prisma.priceBookVersion.create({
      data: {
        name: "Cancel Test V1",
        effectiveFrom: new Date(yesterday.toISOString().slice(0, 10) + "T00:00:00Z"),
      },
    });
    for (const dayType of ["REGULAR", "WEEKEND", "HOLIDAY"]) {
      await prisma.priceCell.create({
        data: { versionId: version.id, ticketTypeId, timeWindowId: tw.id, dayType, priceVnd: 200_000 },
      });
    }

    // ── Cashier user ──────────────────────────────────────────────────────────
    const cashier = await prisma.appUser.create({
      data: {
        username: "cancel-cashier",
        passwordHash: await argon2.hash("Password123"),
        role: "THU_NGAN",
        chainWide: false,
        mustChangePassword: false,
        tokenVersion: 0,
      },
    });
    cashierId = cashier.id;
    await prisma.userBranch.create({ data: { userId: cashierId, branchId } });

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "cancel-cashier", password: "Password123" })
      .expect(201);
    cashierToken = loginRes.body.accessToken as string;

    // ── Manager user with approvalPinHash ─────────────────────────────────────
    const manager = await prisma.appUser.create({
      data: {
        username: "cancel-manager",
        passwordHash: await argon2.hash("Password123"),
        role: "QUAN_LY_CN",
        chainWide: false,
        mustChangePassword: false,
        tokenVersion: 0,
        approvalPinHash: await argon2.hash(MANAGER_PIN),
        pinFailedCount: 0,
      },
    });
    managerId = manager.id;
    await prisma.userBranch.create({ data: { userId: managerId, branchId } });

    // ── Open shift ────────────────────────────────────────────────────────────
    const today = new Date();
    const openShift = await prisma.shift.create({
      data: {
        branchId,
        deviceId,
        businessDate: new Date(today.toISOString().slice(0, 10) + "T00:00:00Z"),
        status: "OPEN",
        openedBy: cashierId,
        openingCashVnd: 0,
      },
    });
    openShiftId = openShift.id;

    // ── Closed shift (for IDOR cancel test) ──────────────────────────────────
    const closedShift = await prisma.shift.create({
      data: {
        branchId,
        deviceId,
        // Use a past date so we can have two shifts for same device (the partial
        // unique index only blocks two OPEN shifts on the same device)
        businessDate: new Date("2026-01-01T00:00:00Z"),
        status: "CLOSED",
        openedBy: cashierId,
        openingCashVnd: 0,
        closedBy: cashierId,
        closedAt: new Date(),
        expectedCashVnd: 0,
        countedCashVnd: 0,
        varianceVnd: 0,
      },
    });
    closedShiftId = closedShift.id;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  // ─── Helper: create a bill ─────────────────────────────────────────────────
  async function createBill(clientUuid: string, shiftId = openShiftId) {
    const res = await request(app.getHttpServer())
      .post("/sales/bills")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        branchId,
        deviceId,
        shiftId,
        lines: [{ ticketTypeId, qty: 1 }],
        clientUuid,
      })
      .expect(201);
    return res.body as { id: string; number: string; totalVnd: number };
  }

  // ─── (a) Payments ──────────────────────────────────────────────────────────

  it("(a1) payment sum < totalVnd → 400", async () => {
    const bill = await createBill("pay-under-uuid");

    await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/payments`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ payments: [{ method: "CASH", amountVnd: bill.totalVnd - 1 }] })
      .expect(400);
  });

  it("(a1b) payment sum > totalVnd → 400", async () => {
    const bill = await createBill("pay-over-uuid");

    await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/payments`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ payments: [{ method: "CASH", amountVnd: bill.totalVnd + 1 }] })
      .expect(400);
  });

  it("(a2) payment sum == totalVnd → 201 + paidAt set", async () => {
    const bill = await createBill("pay-exact-uuid");

    const res = await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/payments`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        payments: [
          { method: "CASH", amountVnd: 100_000 },
          { method: "VIETQR", amountVnd: 100_000 },
        ],
      })
      .expect(201);

    const paid = res.body as { paidAt: string | null; payments: unknown[] };
    expect(paid.paidAt).not.toBeNull();
    expect(paid.payments).toHaveLength(2);

    // Verify in DB
    const dbBill = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(dbBill!.paidAt).not.toBeNull();
  });

  it("(a3) paying an already-paid bill → 409 Conflict", async () => {
    const bill = await createBill("pay-double-uuid");

    // First payment succeeds
    await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/payments`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ payments: [{ method: "CASH", amountVnd: bill.totalVnd }] })
      .expect(201);

    // Second payment → 409
    await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/payments`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ payments: [{ method: "CASH", amountVnd: bill.totalVnd }] })
      .expect(409);
  });

  it("(a4) empty payments array → 400", async () => {
    const bill = await createBill("pay-empty-uuid");

    await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/payments`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ payments: [] })
      .expect(400);
  });

  it("(a5) CASH over-tender records the change", async () => {
    const bill = await createBill("pay-change-uuid");

    const res = await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/payments`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        payments: [{ method: "CASH", amountVnd: bill.totalVnd, tenderedVnd: bill.totalVnd + 50_000 }],
      })
      .expect(201);

    const paid = res.body as { paidAt: string | null };
    expect(paid.paidAt).not.toBeNull();

    const dbPayment = await prisma.payment.findFirst({ where: { billId: bill.id } });
    expect(dbPayment!.amountVnd).toBe(bill.totalVnd); // applied amount == bill total
    expect(dbPayment!.tenderedVnd).toBe(bill.totalVnd + 50_000);
    expect(dbPayment!.changeVnd).toBe(50_000);
  });

  it("(a6) tenderedVnd on a non-CASH method → 400", async () => {
    const bill = await createBill("pay-tender-noncash-uuid");

    await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/payments`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ payments: [{ method: "VIETQR", amountVnd: bill.totalVnd, tenderedVnd: bill.totalVnd + 1 }] })
      .expect(400);
  });

  it("(a7) tenderedVnd less than amountVnd → 400", async () => {
    const bill = await createBill("pay-tender-short-uuid");

    await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/payments`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ payments: [{ method: "CASH", amountVnd: bill.totalVnd, tenderedVnd: bill.totalVnd - 1 }] })
      .expect(400);
  });

  // ─── (b) Cancellation ──────────────────────────────────────────────────────

  it("(b5) cancel a bill whose shift is CLOSED → 403", async () => {
    // Create a bill directly on the CLOSED shift via Prisma (bypass service
    // validation so we can test the cancel IDOR guard independently)
    const closedBill = await prisma.bill.create({
      data: {
        number: "TC01-000101-0001",
        seq: 1,
        branchId,
        shiftId: closedShiftId,
        deviceId,
        businessDate: new Date("2026-01-01T00:00:00Z"),
        status: "COMPLETED",
        createdBy: cashierId,
        totalVnd: 200_000,
        guestCount: 1,
        lines: {
          create: [{
            ticketTypeId,
            ticketTypeName: "Người lớn",
            unitPriceVnd: 200_000,
            qty: 1,
            lineTotalVnd: 200_000,
            isFree: false,
          }],
        },
      },
    });

    await request(app.getHttpServer())
      .post(`/sales/bills/${closedBill.id}/cancel`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        reason: "test cancel closed",
        managerId,
        pin: MANAGER_PIN,
        deviceId,
      })
      .expect(403);
  });

  it("(b6) happy path: cancel with valid manager PIN → CANCELLED, number retained", async () => {
    const bill = await createBill("cancel-happy-uuid");
    const originalNumber = bill.number;

    const res = await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/cancel`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        reason: "Khách đổi ý",
        managerId,
        pin: MANAGER_PIN,
        deviceId,
      })
      .expect(201);

    const cancelled = res.body as {
      status: string;
      number: string;
      cancelReason: string;
      cancelApprovedBy: string;
      cancelledAt: string | null;
    };

    expect(cancelled.status).toBe("CANCELLED");
    // Number is retained — no gap in the range
    expect(cancelled.number).toBe(originalNumber);
    expect(cancelled.cancelReason).toBe("Khách đổi ý");
    expect(cancelled.cancelApprovedBy).toBe(managerId);
    expect(cancelled.cancelledAt).not.toBeNull();

    // Verify in DB
    const dbBill = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(dbBill!.status).toBe("CANCELLED");
    expect(dbBill!.number).toBe(originalNumber);
  });

  it("(b7) cancel with wrong deviceId → 403 (IDOR guard)", async () => {
    const bill = await createBill("cancel-wrong-device-uuid");

    await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/cancel`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        reason: "test",
        managerId,
        pin: MANAGER_PIN,
        deviceId: "wrong-device-id",
      })
      .expect(403);
  });

  it("(b8) cancel already-CANCELLED bill → 400", async () => {
    const bill = await createBill("cancel-twice-uuid");

    // First cancel succeeds
    await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/cancel`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ reason: "First cancel", managerId, pin: MANAGER_PIN, deviceId })
      .expect(201);

    // Reset manager PIN fail count (PIN was used once)
    await prisma.appUser.update({
      where: { id: managerId },
      data: { pinFailedCount: 0 },
    });

    // Second cancel → 400 (not COMPLETED anymore)
    await request(app.getHttpServer())
      .post(`/sales/bills/${bill.id}/cancel`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ reason: "Second cancel", managerId, pin: MANAGER_PIN, deviceId })
      .expect(400);
  });
});
