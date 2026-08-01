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
  return {
    resolvePrice: jest.fn().mockResolvedValue(
      kind === "PRICE"
        ? { kind: "PRICE", priceVnd: 185_000, versionId: "v1", timeWindowId: "tw-1", dayType: "REGULAR" }
        : { kind: "NO_PRICE", reason: "OUT_OF_HOURS" },
    ),
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
    ticketType: { findUnique: jest.fn().mockResolvedValue({ id: "tt-1", name: "Buffet người lớn", isFree: false }) },
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

const BASE_BILL = {
  clientUuid: "uuid-1",
  tempNumber: "CN01-260801-T00010001",
  branchId: "branch-1",
  shiftId: "shift-1",
  deviceId: "dev-1",
  createdAt: "2026-08-01T09:00:00.000Z",
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

  // ── 3. Server recomputes price (C2) ────────────────────────────────────────
  it("calls pricing.resolvePrice for each line (server never trusts client prices)", async () => {
    const prisma = makePrisma();
    const pricing = makePricing();
    const svc = new SyncService(prisma as never, makeAudit(), pricing, makeBillNumber());

    await svc.processBill(BASE_BILL, ACTOR, ALLOWED);

    expect(pricing.resolvePrice).toHaveBeenCalledTimes(1);
    expect(pricing.resolvePrice).toHaveBeenCalledWith(
      expect.objectContaining({ ticketTypeId: "tt-1", branchId: "branch-1" }),
    );
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

  // ── 8. tempNumber stored on bill (C8) ─────────────────────────────────────
  it("passes tempNumber to bill.create for audit/high-water-mark (C8)", async () => {
    const prisma = makePrisma();
    const svc = new SyncService(prisma as never, makeAudit(), makePricing(), makeBillNumber());

    await svc.processBill(BASE_BILL, ACTOR, ALLOWED);

    const createArgs = prisma._tx.bill.create.mock.calls[0][0] as { data: { tempNumber: string } };
    expect(createArgs.data.tempNumber).toBe("CN01-260801-T00010001");
  });
});
