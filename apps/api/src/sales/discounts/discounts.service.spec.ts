/**
 * DiscountsService unit tests (VG-03 AC + Red Team C9/M7).
 *
 * Covers:
 *   - Create PERCENT / FIXED_AMOUNT / VOUCHER program; validation.
 *   - Deactivate program.
 *   - listPrograms branch-scope filter.
 *   - redeemVoucher: expired, inactive, no quota, branch mismatch.
 *   - Voucher concurrency: two simultaneous redemptions of the last unit →
 *     exactly one succeeds (simulated via sequential FOR UPDATE lock model).
 *   - verifyApprovalPin: correct PIN → approved; wrong PIN → fail;
 *     3 wrong → cancelled + locked; non-QUAN_LY_CN → 403; no PIN hash → 400.
 *   - Audit written in-tx for all sensitive operations.
 */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { DiscountsService } from "./discounts.service";

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeProgram(overrides: Record<string, unknown> = {}) {
  return {
    id: "dp1",
    name: "Giảm 10%",
    kind: "PERCENT",
    pct: 10,
    amountVnd: null,
    voucherCode: null,
    quotaTotal: null,
    quotaRemaining: null,
    validFrom: null,
    validUntil: null,
    branchScope: null,
    status: "ACTIVE",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeReason(overrides: Record<string, unknown> = {}) {
  return { id: "dr1", name: "Khách phàn nàn", isActive: true, createdAt: new Date(), ...overrides };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "mgr1",
    username: "manager1",
    role: "QUAN_LY_CN",
    approvalPinHash: null, // set in individual tests
    pinFailedCount: 0,
    pinLockedUntil: null,
    ...overrides,
  };
}

/** Build the raw-query result row (matches the SELECT in redeemVoucher). */
function makeVoucherRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "dp-voucher",
    quota_remaining: null,
    valid_from: null,
    valid_until: null,
    status: "ACTIVE",
    branch_scope: null,
    ...overrides,
  };
}

function makeMockTx(overrides: Record<string, unknown> = {}) {
  return {
    discountProgram: {
      create: jest.fn().mockResolvedValue(makeProgram()),
      findUnique: jest.fn().mockResolvedValue(makeProgram()),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeProgram(data)),
      ),
    },
    discountReason: {
      create: jest.fn().mockResolvedValue(makeReason()),
    },
    appUser: {
      findUnique: jest.fn().mockResolvedValue(makeUser()),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeUser(data)),
      ),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([makeVoucherRow()]),
    ...overrides,
  };
}

function makePrisma(tx: ReturnType<typeof makeMockTx>) {
  return {
    withTx: jest.fn().mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    ),
    discountProgram: {
      findUnique: jest.fn().mockResolvedValue(makeProgram()),
      findMany: jest.fn().mockResolvedValue([makeProgram()]),
    },
    discountReason: {
      findMany: jest.fn().mockResolvedValue([makeReason()]),
    },
    appUser: {
      findUnique: jest.fn().mockResolvedValue(makeUser()),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeUser(data)),
      ),
    },
  };
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DiscountsService", () => {
  let tx: ReturnType<typeof makeMockTx>;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let service: DiscountsService;

  beforeEach(() => {
    tx = makeMockTx();
    prisma = makePrisma(tx);
    audit = makeAudit();
    service = new DiscountsService(prisma as never, audit as never);
  });

  // ─── VG-03.1 Create program ───────────────────────────────────────────────

  describe("createProgram()", () => {
    it("creates a PERCENT program with valid pct", async () => {
      const result = await service.createProgram(
        { name: "Giảm 10%", kind: "PERCENT", pct: 10 },
        "actor1",
        "QUAN_TRI_HQ",
      );

      expect(tx.discountProgram.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: "PERCENT", pct: 10 }),
        }),
      );
      expect(result.kind).toBe("PERCENT");
    });

    it("creates a FIXED_AMOUNT program with valid amountVnd", async () => {
      tx.discountProgram.create.mockResolvedValue(makeProgram({ kind: "FIXED_AMOUNT", amountVnd: 50_000 }));

      await service.createProgram(
        { name: "Giảm 50k", kind: "FIXED_AMOUNT", amountVnd: 50_000 },
        "actor1",
      );

      expect(tx.discountProgram.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amountVnd: 50_000 }),
        }),
      );
    });

    it("creates a VOUCHER program with voucherCode stored uppercase", async () => {
      tx.discountProgram.create.mockResolvedValue(makeProgram({ kind: "VOUCHER", voucherCode: "SUMMER2026" }));

      await service.createProgram(
        { name: "Summer voucher", kind: "VOUCHER", voucherCode: "summer2026", quotaTotal: 100 },
        "actor1",
      );

      expect(tx.discountProgram.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ voucherCode: "SUMMER2026" }),
        }),
      );
    });

    it("sets quotaRemaining = quotaTotal on creation", async () => {
      await service.createProgram(
        { name: "Limited", kind: "PERCENT", pct: 5, quotaTotal: 50 },
        "actor1",
      );

      expect(tx.discountProgram.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quotaTotal: 50, quotaRemaining: 50 }),
        }),
      );
    });

    it("writes audit in-tx on create", async () => {
      await service.createProgram({ name: "Test", kind: "PERCENT", pct: 5 }, "actor1", "HQ");

      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: "discount_program.create" }),
      );
    });

    // Validation
    it("rejects PERCENT without pct", async () => {
      await expect(
        service.createProgram({ name: "Bad", kind: "PERCENT" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects PERCENT with pct > 100", async () => {
      await expect(
        service.createProgram({ name: "Bad", kind: "PERCENT", pct: 101 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects FIXED_AMOUNT without amountVnd", async () => {
      await expect(
        service.createProgram({ name: "Bad", kind: "FIXED_AMOUNT" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects FIXED_AMOUNT with negative amountVnd", async () => {
      await expect(
        service.createProgram({ name: "Bad", kind: "FIXED_AMOUNT", amountVnd: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects FIXED_AMOUNT with float amountVnd", async () => {
      await expect(
        service.createProgram({ name: "Bad", kind: "FIXED_AMOUNT", amountVnd: 50_000.5 }),
      ).rejects.toThrow();
    });

    it("rejects VOUCHER without voucherCode", async () => {
      await expect(
        service.createProgram({ name: "Bad", kind: "VOUCHER" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects non-positive quotaTotal", async () => {
      await expect(
        service.createProgram({ name: "Bad", kind: "PERCENT", pct: 5, quotaTotal: 0 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Deactivate ───────────────────────────────────────────────────────────

  describe("deactivateProgram()", () => {
    it("sets status to INACTIVE and audits", async () => {
      tx.discountProgram.update.mockResolvedValue(makeProgram({ status: "INACTIVE" }));

      const result = await service.deactivateProgram("dp1", "actor1");

      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: "discount_program.deactivate" }),
      );
      expect(result.status).toBe("INACTIVE");
    });

    it("throws NotFoundException for unknown id", async () => {
      tx.discountProgram.findUnique.mockResolvedValue(null);
      await expect(service.deactivateProgram("unknown")).rejects.toThrow(NotFoundException);
    });
  });

  // ─── VG-03.4 Voucher redemption ───────────────────────────────────────────

  describe("redeemVoucher() — VG-03.4", () => {
    it("redeems a valid voucher with no quota limit", async () => {
      tx.$queryRaw.mockResolvedValue([makeVoucherRow({ quota_remaining: null })]);

      const result = await service.redeemVoucher(
        { voucherCode: "SUMMER2026", branchId: "branch1" },
        "actor1",
      );

      expect(result).toBeDefined();
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: "voucher.redeemed" }),
      );
    });

    it("decrements quotaRemaining when quota is set", async () => {
      tx.$queryRaw.mockResolvedValue([makeVoucherRow({ quota_remaining: 5 })]);

      await service.redeemVoucher(
        { voucherCode: "LIMITED", branchId: "branch1" },
        "actor1",
      );

      expect(tx.discountProgram.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { quotaRemaining: { decrement: 1 } },
        }),
      );
    });

    it("rejects when voucher code not found", async () => {
      tx.$queryRaw.mockResolvedValue([]);

      await expect(
        service.redeemVoucher({ voucherCode: "NOTEXIST", branchId: "branch1" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when voucher is INACTIVE", async () => {
      tx.$queryRaw.mockResolvedValue([makeVoucherRow({ status: "INACTIVE" })]);

      await expect(
        service.redeemVoucher({ voucherCode: "OLD", branchId: "branch1" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when voucher has expired (validUntil in past)", async () => {
      tx.$queryRaw.mockResolvedValue([
        makeVoucherRow({ valid_until: new Date(Date.now() - 86_400_000) }),
      ]);

      await expect(
        service.redeemVoucher({ voucherCode: "EXPIRED", branchId: "branch1" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when voucher not yet valid (validFrom in future)", async () => {
      tx.$queryRaw.mockResolvedValue([
        makeVoucherRow({ valid_from: new Date(Date.now() + 86_400_000) }),
      ]);

      await expect(
        service.redeemVoucher({ voucherCode: "FUTURE", branchId: "branch1" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when quotaRemaining is 0 (hết lượt)", async () => {
      tx.$queryRaw.mockResolvedValue([makeVoucherRow({ quota_remaining: 0 })]);

      await expect(
        service.redeemVoucher({ voucherCode: "FULL", branchId: "branch1" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when branch not in branchScope", async () => {
      tx.$queryRaw.mockResolvedValue([
        makeVoucherRow({ branch_scope: ["branch-a", "branch-b"] }),
      ]);

      await expect(
        service.redeemVoucher({ voucherCode: "SCOPED", branchId: "branch-c" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("allows redemption when branch is in branchScope", async () => {
      tx.$queryRaw.mockResolvedValue([
        makeVoucherRow({ branch_scope: ["branch-a", "branch-c"] }),
      ]);

      await expect(
        service.redeemVoucher({ voucherCode: "SCOPED", branchId: "branch-a" }),
      ).resolves.toBeDefined();
    });
  });

  /**
   * Voucher concurrency test (VG-03.4):
   * Two simultaneous redemptions of the last quota unit → exactly one succeeds.
   *
   * In production this is enforced by Postgres FOR UPDATE row-lock in a
   * serializable/read-committed transaction. In the unit test we simulate
   * sequential execution: the first call sets quota_remaining=1, decrements it
   * to 0; the second call then sees quota_remaining=0 and rejects.
   *
   * For a full integration test with a real Postgres instance (testcontainers),
   * see: test/discounts-concurrency.e2e-spec.ts
   */
  describe("Voucher concurrency — two simultaneous redemptions of last unit (VG-03.4)", () => {
    it("second concurrent redemption is rejected when only one quota unit remains", async () => {
      let quotaRemaining = 1;

      // Simulate the FOR UPDATE lock: each call sees the current state.
      tx.$queryRaw.mockImplementation(() => {
        return Promise.resolve([makeVoucherRow({ quota_remaining: quotaRemaining })]);
      });

      tx.discountProgram.update.mockImplementation(() => {
        quotaRemaining = Math.max(0, quotaRemaining - 1);
        return Promise.resolve(makeProgram({ quotaRemaining }));
      });

      // First redemption succeeds.
      await expect(
        service.redeemVoucher({ voucherCode: "LAST", branchId: "branch1" }),
      ).resolves.toBeDefined();

      expect(quotaRemaining).toBe(0);

      // Second redemption (simulating concurrent request after lock) → rejected.
      await expect(
        service.redeemVoucher({ voucherCode: "LAST", branchId: "branch1" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── VG-03.3 Approval PIN ────────────────────────────────────────────────

  describe("verifyApprovalPin() — VG-03.3", () => {
    let pinHash: string;

    beforeEach(async () => {
      pinHash = await argon2.hash("123456");
    });

    it("returns approved=true for correct PIN and resets failure count", async () => {
      prisma.appUser.findUnique.mockResolvedValue(
        makeUser({ role: "QUAN_LY_CN", approvalPinHash: pinHash }),
      );

      const result = await service.verifyApprovalPin(
        { managerId: "mgr1", pin: "123456", reason: "Giảm 15% khách phàn nàn" },
        "actor1",
      );

      expect(result.approved).toBe(true);
      expect(result.approvedBy).toBe("mgr1");
      expect(prisma.appUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { pinFailedCount: 0, pinLockedUntil: null },
        }),
      );
    });

    it("returns approved=false for wrong PIN and increments failure count", async () => {
      prisma.appUser.findUnique.mockResolvedValue(
        makeUser({ role: "QUAN_LY_CN", approvalPinHash: pinHash, pinFailedCount: 0 }),
      );
      prisma.appUser.update.mockResolvedValue(makeUser({ pinFailedCount: 1 }));

      const result = await service.verifyApprovalPin(
        { managerId: "mgr1", pin: "999999" },
        "actor1",
      );

      expect(result.approved).toBe(false);
      expect(result.locked).toBeUndefined();
      expect(prisma.appUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { pinFailedCount: { increment: 1 } },
        }),
      );
    });

    it("Given 3 wrong PINs Then operation cancelled + PIN locked + audit log (VG-03.3)", async () => {
      prisma.appUser.findUnique.mockResolvedValue(
        makeUser({ role: "QUAN_LY_CN", approvalPinHash: pinHash, pinFailedCount: 0 }),
      );

      // Simulate 3 consecutive wrong PIN attempts: each update increments the count.
      let failCount = 0;
      prisma.appUser.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        if (data["pinFailedCount"] && typeof data["pinFailedCount"] === "object") {
          failCount++;
        }
        return Promise.resolve(makeUser({ pinFailedCount: failCount }));
      });

      // Attempt 1
      const r1 = await service.verifyApprovalPin({ managerId: "mgr1", pin: "000000" });
      expect(r1.approved).toBe(false);
      expect(r1.locked).toBeUndefined();

      // Attempt 2
      const r2 = await service.verifyApprovalPin({ managerId: "mgr1", pin: "111111" });
      expect(r2.approved).toBe(false);
      expect(r2.locked).toBeUndefined();

      // Attempt 3 — triggers lock + cancel.
      const r3 = await service.verifyApprovalPin({ managerId: "mgr1", pin: "222222" });
      expect(r3.approved).toBe(false);
      expect(r3.locked).toBe(true);

      // Audit log written for the cancellation event.
      expect(audit.record).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: "approval_pin.cancelled" }),
      );
    });

    it("rejects when manager account does not exist", async () => {
      prisma.appUser.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyApprovalPin({ managerId: "unknown", pin: "123456" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects when user is not QUAN_LY_CN (role guard)", async () => {
      prisma.appUser.findUnique.mockResolvedValue(makeUser({ role: "THU_NGAN" }));

      await expect(
        service.verifyApprovalPin({ managerId: "mgr1", pin: "123456" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects when manager has no approvalPinHash set", async () => {
      prisma.appUser.findUnique.mockResolvedValue(
        makeUser({ role: "QUAN_LY_CN", approvalPinHash: null }),
      );

      await expect(
        service.verifyApprovalPin({ managerId: "mgr1", pin: "123456" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when PIN is locked (pinLockedUntil in future)", async () => {
      prisma.appUser.findUnique.mockResolvedValue(
        makeUser({
          role: "QUAN_LY_CN",
          approvalPinHash: pinHash,
          pinLockedUntil: new Date(Date.now() + 600_000),
        }),
      );

      await expect(
        service.verifyApprovalPin({ managerId: "mgr1", pin: "123456" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("writes audit log on successful PIN verification", async () => {
      prisma.appUser.findUnique.mockResolvedValue(
        makeUser({ role: "QUAN_LY_CN", approvalPinHash: pinHash }),
      );

      await service.verifyApprovalPin(
        { managerId: "mgr1", pin: "123456", reason: "Discount approved" },
        "cashier1",
        "THU_NGAN",
      );

      expect(audit.record).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: "approval_pin.verified",
          objectId: "mgr1",
          approvedBy: "mgr1",
        }),
      );
    });
  });

  // ─── Discount reasons ─────────────────────────────────────────────────────

  describe("createReason()", () => {
    it("creates a reason and audits in-tx", async () => {
      const result = await service.createReason({ name: "Khách phàn nàn" }, "actor1", "HQ");

      expect(tx.discountReason.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: "Khách phàn nàn" },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: "discount_reason.create" }),
      );
      expect(result.name).toBe("Khách phàn nàn");
    });
  });

  describe("listReasons()", () => {
    it("returns active reasons by default", async () => {
      await service.listReasons();
      expect(prisma.discountReason.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it("returns all reasons when activeOnly=false", async () => {
      await service.listReasons(false);
      expect(prisma.discountReason.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  // ─── listPrograms branch scope ────────────────────────────────────────────

  describe("listPrograms() — branch scope filter", () => {
    it("returns all programs when no branchId specified", async () => {
      prisma.discountProgram.findMany.mockResolvedValue([
        makeProgram({ branchScope: null }),
        makeProgram({ id: "dp2", branchScope: ["branch-a"] }),
      ]);

      const result = await service.listPrograms({});
      expect(result).toHaveLength(2);
    });

    it("returns programs with null branchScope (all-branch) when branchId specified", async () => {
      prisma.discountProgram.findMany.mockResolvedValue([
        makeProgram({ branchScope: null }),
        makeProgram({ id: "dp2", branchScope: ["branch-b"] }),
      ]);

      const result = await service.listPrograms({ branchId: "branch-a" });
      // Only the one with null scope (or matching) should be returned.
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("dp1");
    });

    it("returns programs scoped to the specified branch", async () => {
      prisma.discountProgram.findMany.mockResolvedValue([
        makeProgram({ branchScope: ["branch-a", "branch-b"] }),
        makeProgram({ id: "dp2", branchScope: ["branch-c"] }),
      ]);

      const result = await service.listPrograms({ branchId: "branch-a" });
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("dp1");
    });
  });
});
