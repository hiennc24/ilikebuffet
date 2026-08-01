/**
 * Shift lifecycle integration tests — real Postgres via testcontainer.
 *
 * Why real DB (not SQLite / mocks):
 *   The partial unique index `shift_one_open_per_device` only exists in Postgres
 *   and is not expressible in Prisma schema alone. SQLite would not enforce it.
 *
 * Scenarios:
 *   1. Opening a second OPEN shift on the same device → ConflictException (P2002).
 *   2. close() computes expectedCashVnd = openingCash + CASH payments only
 *      (CARD payments must NOT be counted); varianceVnd is correct.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ConflictException } from "@nestjs/common";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { ShiftsService } from "../src/sales/shifts/shifts.service";

// ─── Minimal DiscountsService stub — only verifyApprovalPin is needed here ───

class StubDiscountsService {
  async verifyApprovalPin() {
    return { approved: true, approvedBy: "mgr-1" };
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("shift lifecycle (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let service: ShiftsService;

  const SCHEMA_PATH = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");

  beforeAll(async () => {
    db = await startTestDb();
    delete process.env.APP_DATABASE_URL;
    process.env.DATABASE_URL = db.url;

    execFileSync(
      "npx",
      ["prisma", "migrate", "deploy", "--schema", SCHEMA_PATH],
      { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" },
    );

    prisma = new PrismaService();
    await prisma.$connect();

    const audit = new AuditService(prisma);
    service = new ShiftsService(prisma, audit, new StubDiscountsService() as never);
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  // ── helpers ──────────────────────────────────────────────────────────────────

  // ── 1. Partial-unique: second OPEN shift on same device → ConflictException ──

  describe("open — partial unique enforcement", () => {
    const DEVICE = "device-unique-test";
    const BRANCH = "branch-unique-test";

    it("allows the first OPEN shift", async () => {
      const shift = await service.open(
        { branchId: BRANCH, deviceId: DEVICE, openingCashVnd: 100_000 },
        "cashier-1",
        "THU_NGAN",
      );
      expect(shift.id).toBeTruthy();
      expect(shift.status).toBe("OPEN");
    });

    it("rejects a second OPEN shift on the same device with ConflictException", async () => {
      await expect(
        service.open(
          { branchId: BRANCH, deviceId: DEVICE, openingCashVnd: 50_000 },
          "cashier-1",
          "THU_NGAN",
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("allows a new OPEN shift after the first is closed", async () => {
      // Close the existing open shift.
      const openShift = await prisma.shift.findFirst({
        where: { deviceId: DEVICE, status: "OPEN" },
      });
      expect(openShift).toBeTruthy();

      await service.close(
        openShift!.id,
        { countedCashVnd: 100_000 },
        "cashier-1",
        "THU_NGAN",
        { chainWide: true, branchIds: [] },
      );

      // Now opening again must succeed.
      const newShift = await service.open(
        { branchId: BRANCH, deviceId: DEVICE, openingCashVnd: 200_000 },
        "cashier-1",
        "THU_NGAN",
      );
      expect(newShift.status).toBe("OPEN");
    });
  });

  // ── 2. close() — expectedCash = opening + CASH only; variance correct ────────

  describe("close — cash computation", () => {
    const DEVICE = "device-cash-test";
    const BRANCH = "branch-cash-test";

    it("counts only CASH payments and ignores CARD", async () => {
      // Seed a shift directly.
      const shift = await prisma.shift.create({
        data: {
          branchId: BRANCH,
          deviceId: DEVICE,
          businessDate: new Date("2026-08-01T00:00:00Z"),
          status: "OPEN",
          openedBy: "cashier-2",
          openingCashVnd: 500_000,
        },
      });

      // Seed a COMPLETED bill on this shift.
      const bill = await prisma.bill.create({
        data: {
          number: "CASH-TEST-0001",
          seq: 1,
          branchId: BRANCH,
          shiftId: shift.id,
          deviceId: DEVICE,
          businessDate: new Date("2026-08-01T00:00:00Z"),
          status: "COMPLETED",
          createdBy: "cashier-2",
          totalVnd: 350_000,
          guestCount: 2,
        },
      });

      // Seed two payments: 200_000 CASH + 150_000 CARD.
      await prisma.payment.createMany({
        data: [
          { billId: bill.id, method: "CASH", amountVnd: 200_000 },
          { billId: bill.id, method: "CARD", amountVnd: 150_000 },
        ],
      });

      // Close with countedCash = opening + CASH only = 500_000 + 200_000 = 700_000.
      const closed = await service.close(
        shift.id,
        { countedCashVnd: 700_000 },
        "cashier-2",
        "THU_NGAN",
        { chainWide: true, branchIds: [] },
      );

      expect(closed.status).toBe("CLOSED");
      expect(closed.expectedCashVnd).toBe(700_000); // 500_000 + 200_000 (CARD excluded)
      expect(closed.countedCashVnd).toBe(700_000);
      expect(closed.varianceVnd).toBe(0);
    });

    it("sets non-zero varianceVnd and records note when cash is short", async () => {
      const DEVICE2 = "device-variance-test";

      const shift = await prisma.shift.create({
        data: {
          branchId: BRANCH,
          deviceId: DEVICE2,
          businessDate: new Date("2026-08-01T00:00:00Z"),
          status: "OPEN",
          openedBy: "cashier-3",
          openingCashVnd: 300_000,
        },
      });

      const bill = await prisma.bill.create({
        data: {
          number: "VARIANCE-TEST-0001",
          seq: 2,
          branchId: BRANCH,
          shiftId: shift.id,
          deviceId: DEVICE2,
          businessDate: new Date("2026-08-01T00:00:00Z"),
          status: "COMPLETED",
          createdBy: "cashier-3",
          totalVnd: 100_000,
          guestCount: 1,
        },
      });

      await prisma.payment.create({
        data: { billId: bill.id, method: "CASH", amountVnd: 100_000 },
      });

      // expected = 300_000 + 100_000 = 400_000; counted = 390_000 → variance = -10_000.
      const closed = await service.close(
        shift.id,
        { countedCashVnd: 390_000, varianceNote: "Thiếu 10k" },
        "cashier-3",
        "THU_NGAN",
        { chainWide: true, branchIds: [] },
      );

      expect(closed.expectedCashVnd).toBe(400_000);
      expect(closed.varianceVnd).toBe(-10_000);
      expect(closed.varianceNote).toBe("Thiếu 10k");
    });

    it("excludes CANCELLED bill payments from the expected cash sum", async () => {
      const DEVICE3 = "device-cancelled-bill-test";

      const shift = await prisma.shift.create({
        data: {
          branchId: BRANCH,
          deviceId: DEVICE3,
          businessDate: new Date("2026-08-01T00:00:00Z"),
          status: "OPEN",
          openedBy: "cashier-4",
          openingCashVnd: 0,
        },
      });

      // COMPLETED bill with 100_000 CASH.
      const completedBill = await prisma.bill.create({
        data: {
          number: "CANCELLED-TEST-0001",
          seq: 3,
          branchId: BRANCH,
          shiftId: shift.id,
          deviceId: DEVICE3,
          businessDate: new Date("2026-08-01T00:00:00Z"),
          status: "COMPLETED",
          createdBy: "cashier-4",
          totalVnd: 100_000,
          guestCount: 1,
        },
      });
      await prisma.payment.create({
        data: { billId: completedBill.id, method: "CASH", amountVnd: 100_000 },
      });

      // CANCELLED bill with 50_000 CASH — must NOT be counted.
      const cancelledBill = await prisma.bill.create({
        data: {
          number: "CANCELLED-TEST-0002",
          seq: 4,
          branchId: BRANCH,
          shiftId: shift.id,
          deviceId: DEVICE3,
          businessDate: new Date("2026-08-01T00:00:00Z"),
          status: "CANCELLED",
          createdBy: "cashier-4",
          totalVnd: 50_000,
          guestCount: 1,
        },
      });
      await prisma.payment.create({
        data: { billId: cancelledBill.id, method: "CASH", amountVnd: 50_000 },
      });

      // expected = 0 + 100_000 = 100_000 (cancelled bill excluded).
      const closed = await service.close(
        shift.id,
        { countedCashVnd: 100_000 },
        "cashier-4",
        "THU_NGAN",
        { chainWide: true, branchIds: [] },
      );

      expect(closed.expectedCashVnd).toBe(100_000);
      expect(closed.varianceVnd).toBe(0);
    });
  });
});
