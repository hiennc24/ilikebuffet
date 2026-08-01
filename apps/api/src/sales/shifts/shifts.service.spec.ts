/**
 * ShiftsService unit tests — mocked PrismaService, AuditService, DiscountsService.
 *
 * Covers:
 *   - open: success path audits correctly
 *   - open: P2002 unique violation → ConflictException
 *   - close: variance calc correct (opening + CASH only)
 *   - close: variance !== 0 without note → BadRequestException
 *   - close: non-OPEN shift → ConflictException
 *   - close: shift not found → NotFoundException
 *   - forceClose: bad PIN → ForbiddenException
 *   - forceClose: non-OPEN shift → ConflictException
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ShiftsService } from "./shifts.service";

// ─── Minimal mock factories ───────────────────────────────────────────────────

function makeShift(overrides: Record<string, unknown> = {}) {
  return {
    id: "shift-1",
    branchId: "branch-1",
    deviceId: "device-1",
    businessDate: new Date("2026-08-01T00:00:00Z"),
    status: "OPEN",
    openedBy: "user-1",
    openedAt: new Date(),
    openingCashVnd: 500_000,
    closedBy: null,
    closedAt: null,
    expectedCashVnd: null,
    countedCashVnd: null,
    varianceVnd: null,
    varianceNote: null,
    forceClosedBy: null,
    ...overrides,
  };
}

function makePrisma() {
  // withTx executes the callback immediately with the same mock as `tx`.
  const self: Record<string, unknown> = {};

  const txClient = {
    shift: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      aggregate: jest.fn(),
    },
  };

  self["shift"] = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  };
  self["bill"] = { findMany: jest.fn() };
  self["withTx"] = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(txClient));
  self["_tx"] = txClient; // expose for test assertions

  return self as unknown as {
    shift: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    bill: { findMany: jest.Mock };
    withTx: jest.Mock;
    _tx: typeof txClient;
  };
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

function makeDiscounts() {
  return { verifyApprovalPin: jest.fn() };
}

/** Caller access matching the seeded shift's branch (makeShift → "branch-1"). */
const SHIFT_ACCESS = { chainWide: false, branchIds: ["branch-1"] };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ShiftsService", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let discounts: ReturnType<typeof makeDiscounts>;
  let service: ShiftsService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    discounts = makeDiscounts();
    service = new ShiftsService(
      prisma as never,
      audit as never,
      discounts as never,
    );
  });

  // ── open ────────────────────────────────────────────────────────────────────

  describe("open", () => {
    it("creates shift and audits on success", async () => {
      const shift = makeShift();
      prisma._tx.shift.create.mockResolvedValue(shift);

      const result = await service.open(
        { branchId: "branch-1", deviceId: "device-1", openingCashVnd: 500_000 },
        "user-1",
        "THU_NGAN",
      );

      expect(result).toBe(shift);
      expect(prisma._tx.shift.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branchId: "branch-1",
            deviceId: "device-1",
            openingCashVnd: 500_000,
            status: "OPEN",
            openedBy: "user-1",
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: "shift.open", objectId: shift.id }),
      );
    });

    it("throws ConflictException when device already has an OPEN shift (P2002)", async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "5.x",
      });
      prisma._tx.shift.create.mockRejectedValue(p2002);

      await expect(
        service.open(
          { branchId: "branch-1", deviceId: "device-1", openingCashVnd: 0 },
          "user-1",
          "THU_NGAN",
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("re-throws non-P2002 errors unchanged", async () => {
      prisma._tx.shift.create.mockRejectedValue(new Error("db down"));

      await expect(
        service.open(
          { branchId: "branch-1", deviceId: "device-1", openingCashVnd: 0 },
          "user-1",
          "THU_NGAN",
        ),
      ).rejects.toThrow("db down");
    });
  });

  // ── close ───────────────────────────────────────────────────────────────────

  describe("close", () => {
    it("throws NotFoundException when shift does not exist", async () => {
      prisma._tx.shift.findUnique.mockResolvedValue(null);

      await expect(
        service.close("nonexistent", { countedCashVnd: 100 }, "user-1", "THU_NGAN", SHIFT_ACCESS),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ConflictException when shift is not OPEN", async () => {
      prisma._tx.shift.findUnique.mockResolvedValue(makeShift({ status: "CLOSED" }));

      await expect(
        service.close("shift-1", { countedCashVnd: 100 }, "user-1", "THU_NGAN", SHIFT_ACCESS),
      ).rejects.toThrow(ConflictException);
    });

    it("throws BadRequestException when variance is non-zero without a note", async () => {
      prisma._tx.shift.findUnique.mockResolvedValue(makeShift({ openingCashVnd: 500_000 }));
      // CASH total = 200_000 → expected = 700_000; counted = 690_000 → variance = -10_000
      prisma._tx.payment.aggregate.mockResolvedValue({ _sum: { amountVnd: 200_000 } });

      await expect(
        service.close("shift-1", { countedCashVnd: 690_000 }, "user-1", "THU_NGAN", SHIFT_ACCESS),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws ForbiddenException when the caller's branch excludes the shift's branch", async () => {
      prisma._tx.shift.findUnique.mockResolvedValue(makeShift({ branchId: "branch-1" }));
      await expect(
        service.close("shift-1", { countedCashVnd: 100_000 }, "user-1", "THU_NGAN", {
          chainWide: false,
          branchIds: ["branch-OTHER"],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("computes expectedCashVnd = opening + CASH payments and varianceVnd correctly", async () => {
      const shift = makeShift({ openingCashVnd: 500_000 });
      prisma._tx.shift.findUnique.mockResolvedValue(shift);
      // Two CASH payments total 300_000.
      prisma._tx.payment.aggregate.mockResolvedValue({ _sum: { amountVnd: 300_000 } });

      const updatedShift = makeShift({
        status: "CLOSED",
        expectedCashVnd: 800_000,
        countedCashVnd: 800_000,
        varianceVnd: 0,
      });
      prisma._tx.shift.update.mockResolvedValue(updatedShift);

      const result = await service.close(
        "shift-1",
        { countedCashVnd: 800_000 },
        "user-1",
        "THU_NGAN",
        SHIFT_ACCESS,
      );

      expect(prisma._tx.shift.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CLOSED",
            expectedCashVnd: 800_000,
            countedCashVnd: 800_000,
            varianceVnd: 0,
          }),
        }),
      );
      expect(result).toBe(updatedShift);
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: "shift.close" }),
      );
    });

    it("only counts CASH method — not VIETQR or CARD", async () => {
      // opening = 0, CASH aggregate = 100_000 (ignores CARD/VIETQR at DB level via where clause)
      const shift = makeShift({ openingCashVnd: 0 });
      prisma._tx.shift.findUnique.mockResolvedValue(shift);
      prisma._tx.payment.aggregate.mockResolvedValue({ _sum: { amountVnd: 100_000 } });
      prisma._tx.shift.update.mockResolvedValue(
        makeShift({ status: "CLOSED", expectedCashVnd: 100_000, countedCashVnd: 100_000, varianceVnd: 0 }),
      );

      await service.close("shift-1", { countedCashVnd: 100_000 }, "user-1", "THU_NGAN", SHIFT_ACCESS);

      // The aggregate call must filter by CASH method.
      expect(prisma._tx.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ method: "CASH" }),
        }),
      );
    });

    it("allows close with variance when varianceNote is provided", async () => {
      const shift = makeShift({ openingCashVnd: 500_000 });
      prisma._tx.shift.findUnique.mockResolvedValue(shift);
      prisma._tx.payment.aggregate.mockResolvedValue({ _sum: { amountVnd: 0 } });
      const updatedShift = makeShift({
        status: "CLOSED",
        expectedCashVnd: 500_000,
        countedCashVnd: 490_000,
        varianceVnd: -10_000,
        varianceNote: "Khách thiếu",
      });
      prisma._tx.shift.update.mockResolvedValue(updatedShift);

      const result = await service.close(
        "shift-1",
        { countedCashVnd: 490_000, varianceNote: "Khách thiếu" },
        "user-1",
        "THU_NGAN",
        SHIFT_ACCESS,
      );

      expect(result.varianceVnd).toBe(-10_000);
      expect(result.varianceNote).toBe("Khách thiếu");
    });
  });

  // ── forceClose ──────────────────────────────────────────────────────────────

  describe("forceClose", () => {
    it("throws NotFoundException when shift does not exist", async () => {
      prisma.shift.findUnique.mockResolvedValue(null);

      await expect(
        service.forceClose("nonexistent", { managerId: "mgr-1", pin: "123456" }, "user-1", "THU_NGAN", SHIFT_ACCESS),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ConflictException when shift is not OPEN", async () => {
      prisma.shift.findUnique.mockResolvedValue(makeShift({ status: "CLOSED" }));

      await expect(
        service.forceClose("shift-1", { managerId: "mgr-1", pin: "123456" }, "user-1", "THU_NGAN", SHIFT_ACCESS),
      ).rejects.toThrow(ConflictException);
    });

    it("throws ForbiddenException when manager PIN is invalid", async () => {
      prisma.shift.findUnique.mockResolvedValue(makeShift());
      discounts.verifyApprovalPin.mockResolvedValue({ approved: false });

      await expect(
        service.forceClose("shift-1", { managerId: "mgr-1", pin: "000000" }, "user-1", "THU_NGAN", SHIFT_ACCESS),
      ).rejects.toThrow(ForbiddenException);
    });

    it("updates shift to FORCE_CLOSED and audits when PIN is valid", async () => {
      const shift = makeShift();
      prisma.shift.findUnique.mockResolvedValue(shift);
      discounts.verifyApprovalPin.mockResolvedValue({ approved: true, approvedBy: "mgr-1" });

      const updated = makeShift({ status: "FORCE_CLOSED", forceClosedBy: "mgr-1" });
      prisma._tx.shift.update.mockResolvedValue(updated);

      const result = await service.forceClose(
        "shift-1",
        { managerId: "mgr-1", pin: "123456", reason: "Device hung" },
        "user-1",
        "THU_NGAN",
        SHIFT_ACCESS,
      );

      expect(prisma._tx.shift.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FORCE_CLOSED",
            forceClosedBy: "mgr-1",
            closedBy: "user-1",
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "shift.force_close",
          approvedBy: "mgr-1",
          reason: "Device hung",
        }),
      );
      expect(result).toBe(updated);
    });
  });

  describe("summary (realtime shift monitor)", () => {
    const ACCESS = { chainWide: false, branchIds: ["branch-1"] };
    const now = new Date("2026-08-01T13:30:00+07:00");

    function bill(over: Record<string, unknown>) {
      return {
        id: "b", status: "COMPLETED", totalVnd: 0, guestCount: 0,
        createdAt: now, lines: [], ...over,
      };
    }

    it("aggregates revenue, guests, tickets-by-type, cancels and 30-min pace", async () => {
      prisma.shift.findUnique.mockResolvedValue(makeShift());
      prisma.bill.findMany.mockResolvedValue([
        bill({ totalVnd: 598000, guestCount: 2, createdAt: now, lines: [
          { ticketTypeId: "tt-1", ticketTypeName: "Người lớn", qty: 2 },
        ] }),
        bill({ totalVnd: 159000, guestCount: 1, createdAt: new Date("2026-08-01T12:00:00+07:00"), lines: [
          { ticketTypeId: "tt-2", ticketTypeName: "Trẻ em", qty: 1 },
        ] }),
        bill({ status: "CANCELLED", totalVnd: 200000, guestCount: 1, lines: [] }),
      ]);

      const s = await service.summary("shift-1", ACCESS, now);

      expect(s.billCount).toBe(2);
      expect(s.cancelledCount).toBe(1);
      expect(s.revenueVnd).toBe(757000); // cancelled excluded
      expect(s.guestCount).toBe(3);
      expect(s.ticketsByType).toEqual([
        { ticketTypeId: "tt-1", name: "Người lớn", qty: 2 },
        { ticketTypeId: "tt-2", name: "Trẻ em", qty: 1 },
      ]);
      expect(s.last30mBills).toBe(1); // only the 13:00 bill is within 30' of 13:30
    });

    it("rejects a shift outside the caller's branch scope", async () => {
      prisma.shift.findUnique.mockResolvedValue(makeShift({ branchId: "branch-OTHER" }));
      await expect(service.summary("shift-1", ACCESS, now)).rejects.toThrow(ForbiddenException);
    });

    it("allows a chain-wide user to view any branch", async () => {
      prisma.shift.findUnique.mockResolvedValue(makeShift({ branchId: "branch-OTHER" }));
      prisma.bill.findMany.mockResolvedValue([]);
      const s = await service.summary("shift-1", { chainWide: true, branchIds: [] }, now);
      expect(s.branchId).toBe("branch-OTHER");
    });
  });
});
