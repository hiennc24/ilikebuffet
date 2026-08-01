/**
 * Unit tests for SyncService — P8 offline bill sync.
 *
 * Covers (C5 idempotency is the #1 correctness invariant):
 *  1. Idempotent: same clientUuid submitted twice → 1 bill, "committed" both times.
 *  2. C1 authz: bill branchId not in allowedBranchIds → "rejected", audit logged.
 *  3. Server recomputes price (C2): pricing.resolvePrice is always called.
 *  4. NO_PRICE on line → bill created with unitPriceVnd=0 (never rejects a printed sale, C5).
 *  5. Shift not found → "retry".
 *  6. Successful new bill → "committed" with officialNumber.
 *  7. Full map: batch with 2 bills (one idempotent, one new) → 2 results.
 */

import { SyncService } from "./sync.service";
import type { PricingService } from "../pricing/pricing.service";
import type { BillNumberService } from "./bill-number.service";
import type { AuditService } from "../../audit/audit.service";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makePricing(kind: "PRICE" | "NO_PRICE" = "PRICE"): jest.Mocked<PricingService> {
  const priceResult =
    kind === "PRICE"
      ? { kind: "PRICE", priceVnd: 185_000, versionId: "v1", timeWindowId: "tw-1", dayType: "REGULAR" }
      : { kind: "NO_PRICE", reason: "OUT_OF_HOURS" };
  return {
    resolvePrice: jest.fn().mockResolvedValue(priceResult),
    buildResolver: jest.fn().mockResolvedValue({
      resolve: jest.fn().mockReturnValue(priceResult),
      timeWindowName: jest.fn().mockReturnValue("Trưa"),
    }),
  } as unknown as jest.Mocked<PricingService>;
}

function makeAudit(): jest.Mocked<AuditService> {
  return { record: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditService>;
}

function makeBillNumber(seq = 1): jest.Mocked<BillNumberService> {
  return {
    allocate: jest.fn().mockResolvedValue({ seq, number: `CN01-260801-${String(seq).padStart(4, "0")}` }),
  } as unknown as jest.Mocked<BillNumberService>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePrisma(txOverrides: Record<string, any> = {}, existingBill: unknown = null) {
  const defaultTx = {
    bill: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: "bill-new",
        number: "CN01-260801-0001",
        tempNumber: "CN01-260801-T00010001",
        clientUuid: "uuid-1",
      }),
    },
    shift: {
      findUnique: jest.fn().mockResolvedValue({ id: "shift-1", branchId: "branch-1", status: "OPEN" }),
    },
    branch: { findUnique: jest.fn().mockResolvedValue({ id: "branch-1", code: "CN01" }) },
    ticketType: {
      findUnique: jest.fn().mockResolvedValue({ id: "tt-1", name: "Buffet người lớn", isFree: false }),
      findMany: jest.fn().mockResolvedValue([{ id: "tt-1", name: "Buffet người lớn", isFree: false }]),
    },
    timeWindow: { findUnique: jest.fn().mockResolvedValue({ id: "tw-1", name: "Trưa" }) },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    ...txOverrides,
  };

  return {
    withTx: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(defaultTx)),
    // Top-level bill.findUnique for idempotency pre-check (PrismaService extends PrismaClient)
    bill: {
      findUnique: jest.fn().mockResolvedValue(existingBill),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    _tx: defaultTx,
  };
}

// ─── Base DTO ─────────────────────────────────────────────────────────────────

// Near server time so the createdAt-clamp guard treats these as plausible.
const RECENT_CREATED_AT = new Date().toISOString();

const BASE_BILL = {
  clientUuid: "uuid-1",
  tempNumber: "CN01-260801-T00010001",
  branchId: "branch-1",
  shiftId: "shift-1",
  deviceId: "dev-1",
  createdAt: RECENT_CREATED_AT,
  lines: [{ ticketTypeId: "tt-1", qty: 2 }],
};

const ALLOWED = new Set(["branch-1"]);
const ACTOR = "user-cashier-1";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SyncService — offline bill sync (C5 / C1 / C2)", () => {
  // ── 1. Idempotency ─────────────────────────────────────────────────────────
  it("returns committed for a bill already in DB (idempotent re-sync)", async () => {
    const existing = { number: "CN01-260801-0001", tempNumber: "CN01-260801-T00010001" };
    const prisma = makePrisma({}, existing);
    const svc = new SyncService(prisma as never, makeAudit(), makePricing(), makeBillNumber());

    const result = await svc.processBill(BASE_BILL, ACTOR, ALLOWED);

    expect(result.status).toBe("committed");
    expect(result.officialNumber).toBe("CN01-260801-0001");
    expect(result.clientUuid).toBe("uuid-1");
    // withTx should NOT have been called — idempotency hit before tx
    expect(prisma.withTx).not.toHaveBeenCalled();
  });

  // ── 2. C1 authz rejection ──────────────────────────────────────────────────
  it("returns rejected when bill branchId is not in allowedBranchIds", async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const svc = new SyncService(prisma as never, audit, makePricing(), makeBillNumber());

    const result = await svc.processBill(
      { ...BASE_BILL, branchId: "branch-other" },
      ACTOR,
      new Set(["branch-1"]),
    );

    expect(result.status).toBe("rejected");
    expect(result.error).toMatch(/branch not allowed/);
    expect(result.clientUuid).toBe("uuid-1");
    expect(result.tempNumber).toBe("CN01-260801-T00010001");
    // Audit must be recorded for the rejection
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  // ── 2b. C1 device binding: reject a bill from a different device ──────────
  it("rejects a bill whose deviceId differs from a device-bound token (C1)", async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const svc = new SyncService(prisma as never, audit, makePricing(), makeBillNumber());

    const result = await svc.processBill(
      { ...BASE_BILL, deviceId: "dev-1" },
      ACTOR,
      ALLOWED,
      { tokenDeviceId: "dev-OTHER" },
    );

    expect(result.status).toBe("rejected");
    expect(result.error).toMatch(/device not allowed/);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(prisma.withTx).not.toHaveBeenCalled();
  });

  it("allows the bill when the device-bound token matches (or is absent)", async () => {
    const prisma = makePrisma();
    const svc = new SyncService(prisma as never, makeAudit(), makePricing(), makeBillNumber());
    const matched = await svc.processBill({ ...BASE_BILL, deviceId: "dev-1" }, ACTOR, ALLOWED, { tokenDeviceId: "dev-1" });
    expect(matched.status).toBe("committed");
  });

  // ── 3. Server recomputes price (C2) ────────────────────────────────────────
  it("recomputes price server-side via buildResolver (never trusts client prices)", async () => {
    const prisma = makePrisma();
    const pricing = makePricing();
    const svc = new SyncService(prisma as never, makeAudit(), pricing, makeBillNumber());

    await svc.processBill(BASE_BILL, ACTOR, ALLOWED);

    // One resolver built per bill (branch + createdAt), used for every line.
    expect(pricing.buildResolver).toHaveBeenCalledTimes(1);
    expect(pricing.buildResolver).toHaveBeenCalledWith("branch-1", expect.any(Date));
  });

  // ── 4. NO_PRICE → unitPriceVnd=0, still committed (C5: never reject a printed sale) ──
  it("creates bill with 0 VND when pricing returns NO_PRICE (C5: never reject printed sale)", async () => {
    const prisma = makePrisma();
    const svc = new SyncService(prisma as never, makeAudit(), makePricing("NO_PRICE"), makeBillNumber());

    const result = await svc.processBill(BASE_BILL, ACTOR, ALLOWED);

    // Should commit, not reject
    expect(result.status).toBe("committed");
    // bill.create called with unitPriceVnd=0
    const createArgs = prisma._tx.bill.create.mock.calls[0][0] as { data: { lines: { create: Array<{ unitPriceVnd: number }> } } };
    expect(createArgs.data.lines.create[0].unitPriceVnd).toBe(0);
  });

  // ── 5. Shift not found → retry ────────────────────────────────────────────
  it("returns retry when shift is not found", async () => {
    const prisma = makePrisma({ shift: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new SyncService(prisma as never, makeAudit(), makePricing(), makeBillNumber());

    const result = await svc.processBill(BASE_BILL, ACTOR, ALLOWED);

    expect(result.status).toBe("retry");
    expect(result.error).toMatch(/not found/i);
  });

  // ── 6. Successful new bill → committed with officialNumber ────────────────
  it("creates a new bill and returns committed with officialNumber", async () => {
    const prisma = makePrisma();
    const billNum = makeBillNumber(3);
    const svc = new SyncService(prisma as never, makeAudit(), makePricing(), billNum);

    const result = await svc.processBill(BASE_BILL, ACTOR, ALLOWED);

    expect(result.status).toBe("committed");
    expect(result.officialNumber).toBe("CN01-260801-0003");
    expect(result.clientUuid).toBe("uuid-1");
    expect(result.tempNumber).toBe("CN01-260801-T00010001");
  });

  // ── 7b. C1 content-hash mismatch → rejected + audit ──────────────────────
  it("rejects a dedup hit whose stored content hash differs (C1 tamper/corruption)", async () => {
    // Same (device, uuid) already stored, but with a DIFFERENT content hash.
    const existing = { number: "CN01-260801-0001", contentHash: "a-different-hash" };
    const prisma = makePrisma({}, existing);
    const audit = makeAudit();
    const svc = new SyncService(prisma as never, audit, makePricing(), makeBillNumber());

    const result = await svc.processBill(BASE_BILL, ACTOR, ALLOWED);

    expect(result.status).toBe("rejected");
    expect(result.error).toBe("content_mismatch");
    expect(audit.record).toHaveBeenCalledTimes(1);
    // Must NOT create a bill / allocate a number on a mismatch.
    expect(prisma.withTx).not.toHaveBeenCalled();
  });

  // ── 7c. H5 clock-skew → accepted but quarantined ─────────────────────────
  it("commits but quarantines a bill whose device clock skew exceeds ±2 min (H5)", async () => {
    const prisma = makePrisma();
    const svc = new SyncService(prisma as never, makeAudit(), makePricing(), makeBillNumber());

    const result = await svc.processBill({ ...BASE_BILL, clockOffsetMs: 5 * 60 * 1000 }, ACTOR, ALLOWED);

    expect(result.status).toBe("committed"); // never reject a printed sale
    const data = prisma._tx.bill.create.mock.calls[0][0].data as { quarantined: boolean; quarantineReason: string | null };
    expect(data.quarantined).toBe(true);
    expect(data.quarantineReason).toMatch(/clock_skew/);
  });

  it("does NOT quarantine a bill within clock tolerance", async () => {
    const prisma = makePrisma();
    const svc = new SyncService(prisma as never, makeAudit(), makePricing(), makeBillNumber());

    await svc.processBill({ ...BASE_BILL, clockOffsetMs: 30 * 1000 }, ACTOR, ALLOWED);

    const data = prisma._tx.bill.create.mock.calls[0][0].data as { quarantined: boolean };
    expect(data.quarantined).toBe(false);
  });

  it("quarantines a bill whose createdAt is implausibly far from server time", async () => {
    const prisma = makePrisma();
    const billNum = makeBillNumber();
    const svc = new SyncService(prisma as never, makeAudit(), makePricing(), billNum);

    // A createdAt years off (with a truthful clockOffsetMs) is honored for the
    // counter/date (offline bills may sync late) but flagged for reconciliation.
    const result = await svc.processBill(
      { ...BASE_BILL, createdAt: "2020-01-01T00:00:00.000Z", clockOffsetMs: 0 },
      ACTOR,
      ALLOWED,
    );

    expect(result.status).toBe("committed"); // never reject a printed sale
    const data = prisma._tx.bill.create.mock.calls[0][0].data as {
      quarantined: boolean;
      quarantineReason: string | null;
      createdAt: Date;
    };
    expect(data.quarantined).toBe(true);
    expect(data.quarantineReason).toMatch(/created_at_implausible/);
    // createdAt is trusted, not overwritten: the bill + counter keep the 2020 date.
    expect(data.createdAt.getUTCFullYear()).toBe(2020);
    expect(billNum.allocate.mock.calls[0][3].startsWith("2020")).toBe(true);
  });

  it("rejects a bill with a non-positive/fractional qty (corruption, not a sale)", async () => {
    const prisma = makePrisma();
    const svc = new SyncService(prisma as never, makeAudit(), makePricing(), makeBillNumber());

    const result = await svc.processBill(
      { ...BASE_BILL, lines: [{ ticketTypeId: "tt-1", qty: -3 }] },
      ACTOR,
      ALLOWED,
    );

    expect(result.status).toBe("rejected");
    expect(result.error).toBe("invalid_qty");
    expect(prisma._tx.bill.create).not.toHaveBeenCalled();
  });

  // ── 7d. H3 force-close → committed + quarantined with approver ────────────
  it("force-close accepts a stuck bill as quarantined with the manager as approver (H3)", async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const svc = new SyncService(prisma as never, audit, makePricing(), makeBillNumber());

    const result = await svc.processBill(BASE_BILL, ACTOR, ALLOWED, {
      forceQuarantine: { reason: "force_close_stuck: device dead", approvedBy: "mgr-1" },
    });

    expect(result.status).toBe("committed"); // paper bill must still be accounted
    const data = prisma._tx.bill.create.mock.calls[0][0].data as { quarantined: boolean; quarantineReason: string };
    expect(data.quarantined).toBe(true);
    expect(data.quarantineReason).toMatch(/force_close_stuck/);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "bill.force_close", approvedBy: "mgr-1" }),
    );
  });

  // ── 7e. C8 void-before-sync → audit event, branch-gated ──────────────────
  it("records a void-before-sync audit event for an allowed branch (C8)", async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const svc = new SyncService(prisma as never, audit, makePricing(), makeBillNumber());

    const ok = await svc.recordVoid(
      { tempNumber: "CN01-260801-TDEV009", branchId: "branch-1", deviceId: "dev-1", reason: "khách bỏ" },
      ACTOR,
      ALLOWED,
    );

    expect(ok).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "bill.void_before_sync", branchId: "branch-1" }),
    );
  });

  it("rejects a void-before-sync for a branch not allowed by the token (C1/C8)", async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const svc = new SyncService(prisma as never, audit, makePricing(), makeBillNumber());

    const ok = await svc.recordVoid(
      { tempNumber: "T1", branchId: "branch-other", deviceId: "dev-1" },
      ACTOR,
      new Set(["branch-1"]),
    );

    expect(ok).toBe(false);
    expect(audit.record).not.toHaveBeenCalled();
  });

  // ── 7f. offline payments recorded on sync ────────────────────────────────
  it("records offline payments and sets paidAt when the total matches (BH-03)", async () => {
    const prisma = makePrisma();
    const svc = new SyncService(prisma as never, makeAudit(), makePricing(), makeBillNumber());

    // Pricing 185000 × qty 2 = 370000 total.
    const result = await svc.processBill(
      { ...BASE_BILL, payments: [{ method: "CASH", amountVnd: 370000 }] },
      ACTOR,
      ALLOWED,
    );

    expect(result.status).toBe("committed");
    const data = prisma._tx.bill.create.mock.calls[0][0].data as { paidAt: unknown; quarantined: boolean; payments: { create: unknown[] } };
    expect(data.paidAt).not.toBeNull();
    expect(data.payments.create).toHaveLength(1);
    expect(data.quarantined).toBe(false);
  });

  it("quarantines a bill whose offline payment total ≠ server-recomputed total", async () => {
    const prisma = makePrisma();
    const svc = new SyncService(prisma as never, makeAudit(), makePricing(), makeBillNumber());

    const result = await svc.processBill(
      { ...BASE_BILL, payments: [{ method: "CASH", amountVnd: 300000 }] }, // ≠ 370000
      ACTOR,
      ALLOWED,
    );

    expect(result.status).toBe("committed"); // never reject a paid, printed sale
    const data = prisma._tx.bill.create.mock.calls[0][0].data as { quarantined: boolean; quarantineReason: string };
    expect(data.quarantined).toBe(true);
    expect(data.quarantineReason).toMatch(/payment_mismatch/);
  });

  // ── 8. tempNumber stored on bill (C8) ─────────────────────────────────────
  it("passes tempNumber to bill.create for audit/high-water-mark (C8)", async () => {
    const prisma = makePrisma();
    const svc = new SyncService(prisma as never, makeAudit(), makePricing(), makeBillNumber());

    await svc.processBill(BASE_BILL, ACTOR, ALLOWED);

    const createArgs = prisma._tx.bill.create.mock.calls[0][0] as { data: { tempNumber: string } };
    expect(createArgs.data.tempNumber).toBe("CN01-260801-T00010001");
  });
});
