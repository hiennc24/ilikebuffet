/**
 * Unit tests for BillsService — mocked dependencies.
 *
 * Covers:
 *  1. Client-sent price is ignored; server price is always used.
 *  2. NO_PRICE from pricing → BadRequestException.
 *  3. Policy: all-free-ticket bill → BadRequestException.
 *  4. Cancel IDOR: closed shift → ForbiddenException.
 *  5. Cancel IDOR: different device → ForbiddenException.
 *  6. guestCount includes free tickets in the total.
 *  7. Idempotency: duplicate clientUuid returns existing bill without re-creating.
 */
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { BillsService } from "./bills.service";
import type { PricingService } from "../pricing/pricing.service";
import type { BillNumberService } from "./bill-number.service";
import type { AuditService } from "../../audit/audit.service";
import type { DiscountsService } from "../discounts/discounts.service";

// ─── Mock factory helpers ─────────────────────────────────────────────────────

const DEFAULT_PRICE_RESULT = {
  kind: "PRICE",
  priceVnd: 150_000,
  versionId: "ver-1",
  timeWindowId: "tw-1",
  dayType: "REGULAR",
};

/** Mock PricingService. The service now prices via buildResolver(); the returned
 *  resolver yields `priceResult` for every line. */
function makePricingService(priceResult: unknown = DEFAULT_PRICE_RESULT): jest.Mocked<PricingService> {
  return {
    resolvePrice: jest.fn().mockResolvedValue(priceResult),
    buildResolver: jest.fn().mockResolvedValue({
      resolve: jest.fn().mockReturnValue(priceResult),
      timeWindowName: jest.fn().mockReturnValue("Trưa"),
    }),
  } as unknown as jest.Mocked<PricingService>;
}

function makeAuditService(): jest.Mocked<AuditService> {
  return { record: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditService>;
}

function makeBillNumberService(): jest.Mocked<BillNumberService> {
  return {
    allocate: jest.fn().mockResolvedValue({ seq: 1, number: "CN01-260801-0001" }),
  } as unknown as jest.Mocked<BillNumberService>;
}

function makeDiscountsService(approved = true): jest.Mocked<DiscountsService> {
  return {
    verifyApprovalPin: jest.fn().mockResolvedValue({ approved, approvedBy: "mgr-1" }),
  } as unknown as jest.Mocked<DiscountsService>;
}

// ─── Prisma mock builder ───────────────────────────────────────────────────────

function makeShift(overrides: Record<string, unknown> = {}) {
  return {
    id: "shift-1",
    branchId: "branch-1",
    deviceId: "dev-1",
    status: "OPEN",
    ...overrides,
  };
}

function makeBranch() {
  return { id: "branch-1", code: "CN01" };
}

function makeTicketType(isFree = false) {
  return { id: "tt-1", name: "Người lớn", isFree };
}

function makeTimeWindow() {
  return { id: "tw-1", name: "Trưa" };
}

function makeBill(overrides: Record<string, unknown> = {}) {
  return {
    id: "bill-1",
    number: "CN01-260801-0001",
    seq: 1,
    branchId: "branch-1",
    shiftId: "shift-1",
    deviceId: "dev-1",
    status: "COMPLETED",
    totalVnd: 150_000,
    guestCount: 1,
    paidAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    cancelApprovedBy: null,
    shift: makeShift(),
    lines: [],
    payments: [],
    ...overrides,
  };
}

/**
 * Build a PrismaService mock.
 * `txOverrides` merges onto the default tx delegates.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePrisma(txOverrides: Record<string, any> = {}) {
  const defaultTx = {
    bill: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    shift: { findUnique: jest.fn().mockResolvedValue(makeShift()) },
    branch: { findUnique: jest.fn().mockResolvedValue(makeBranch()) },
    ticketType: {
      findUnique: jest.fn().mockResolvedValue(makeTicketType()),
      findMany: jest.fn().mockResolvedValue([makeTicketType()]),
    },
    timeWindow: { findUnique: jest.fn().mockResolvedValue(makeTimeWindow()) },
    ...txOverrides,
  };

  return {
    withTx: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn(defaultTx),
    ),
    bill: {
      findUnique: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    _defaultTx: defaultTx,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BillsService", () => {
  const BASE_DTO = {
    branchId: "branch-1",
    deviceId: "dev-1",
    shiftId: "shift-1",
    lines: [{ ticketTypeId: "tt-1", qty: 1 }],
  };
  const ACTOR = "user-1";
  const ROLE = "THU_NGAN";
  // Caller access matching the seeded bill's branch (makeBill → "branch-1").
  const BILL_ACCESS = { chainWide: false, branchIds: ["branch-1"] };

  // ── 1. Server price is used; any client-side price would be ignored ──────────
  it("uses server-resolved price, ignoring any hypothetical client price field", async () => {
    const pricing = makePricingService();
    const prisma = makePrisma();

    const createdBill = {
      ...makeBill(),
      lines: [{ unitPriceVnd: 150_000, qty: 1, lineTotalVnd: 150_000 }],
    };
    prisma._defaultTx.bill.create.mockResolvedValue(createdBill);

    const svc = new BillsService(
      prisma as never,
      makeAuditService(),
      pricing,
      makeBillNumberService(),
      makeDiscountsService(),
    );

    const result = await svc.createBill(BASE_DTO, ACTOR, ROLE);

    // Pricing resolver was built server-side for this branch (server priced it).
    expect(pricing.buildResolver).toHaveBeenCalledWith("branch-1", expect.any(Date));
    // The bill's line price matches server-resolved value
    expect(result.lines[0].unitPriceVnd).toBe(150_000);
  });

  // ── 2. NO_PRICE → BadRequest ─────────────────────────────────────────────────
  it("throws BadRequestException when pricing returns NO_PRICE", async () => {
    const pricing = makePricingService({ kind: "NO_PRICE", reason: "OUT_OF_HOURS" });
    const prisma = makePrisma();

    const svc = new BillsService(
      prisma as never,
      makeAuditService(),
      pricing,
      makeBillNumberService(),
      makeDiscountsService(),
    );

    await expect(svc.createBill(BASE_DTO, ACTOR, ROLE)).rejects.toThrow(BadRequestException);
    await expect(svc.createBill(BASE_DTO, ACTOR, ROLE)).rejects.toThrow(
      "Ngoài khung giờ hoặc chưa có giá",
    );
  });

  // ── 3. All-free-ticket policy → BadRequest ────────────────────────────────────
  it("throws BadRequestException when all lines are free tickets (policy V4)", async () => {
    // isFree=true → server returns priceVnd=0
    const pricing = makePricingService({
      kind: "PRICE",
      priceVnd: 0,
      versionId: "",
      timeWindowId: "tw-1",
      dayType: "REGULAR",
    });

    const prisma = makePrisma({
      ticketType: {
        findUnique: jest.fn().mockResolvedValue(makeTicketType(true /* isFree */)),
        findMany: jest.fn().mockResolvedValue([makeTicketType(true /* isFree */)]),
      },
      timeWindow: { findUnique: jest.fn().mockResolvedValue(makeTimeWindow()) },
      bill: { findUnique: jest.fn(), create: jest.fn() },
      shift: { findUnique: jest.fn().mockResolvedValue(makeShift()) },
      branch: { findUnique: jest.fn().mockResolvedValue(makeBranch()) },
    });

    const svc = new BillsService(
      prisma as never,
      makeAuditService(),
      pricing,
      makeBillNumberService(),
      makeDiscountsService(),
    );

    await expect(svc.createBill(BASE_DTO, ACTOR, ROLE)).rejects.toThrow(BadRequestException);
    await expect(svc.createBill(BASE_DTO, ACTOR, ROLE)).rejects.toThrow(
      "Bill phải có ít nhất 1 vé có phí",
    );
  });

  // ── 4. Cancel IDOR: closed shift → Forbidden ─────────────────────────────────
  it("throws ForbiddenException when cancelling a bill from a CLOSED shift", async () => {
    const closedShiftBill = makeBill({ shift: makeShift({ status: "CLOSED" }) });
    const prisma = makePrisma();
    prisma.bill.findUnique = jest.fn().mockResolvedValue(closedShiftBill);

    const svc = new BillsService(
      prisma as never,
      makeAuditService(),
      makePricingService(),
      makeBillNumberService(),
      makeDiscountsService(),
    );

    await expect(
      svc.cancelBill(
        "bill-1",
        { reason: "test", managerId: "mgr-1", pin: "123456", deviceId: "dev-1" },
        ACTOR,
        ROLE,
        BILL_ACCESS,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── 5. Cancel IDOR: different device → Forbidden ─────────────────────────────
  it("throws ForbiddenException when cancelling a bill from a different device", async () => {
    const bill = makeBill({ deviceId: "dev-1", shift: makeShift({ status: "OPEN" }) });
    const prisma = makePrisma();
    prisma.bill.findUnique = jest.fn().mockResolvedValue(bill);

    const svc = new BillsService(
      prisma as never,
      makeAuditService(),
      makePricingService(),
      makeBillNumberService(),
      makeDiscountsService(),
    );

    // Caller uses a DIFFERENT deviceId
    await expect(
      svc.cancelBill(
        "bill-1",
        { reason: "test", managerId: "mgr-1", pin: "123456", deviceId: "dev-WRONG" },
        ACTOR,
        ROLE,
        BILL_ACCESS,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── 5b. Cancel cross-branch: caller's branch excludes the bill's branch → Forbidden
  it("throws ForbiddenException when the caller's branch excludes the bill's branch", async () => {
    const bill = makeBill({ deviceId: "dev-1", shift: makeShift({ status: "OPEN" }) }); // branch-1
    const prisma = makePrisma();
    prisma.bill.findUnique = jest.fn().mockResolvedValue(bill);

    const svc = new BillsService(
      prisma as never,
      makeAuditService(),
      makePricingService(),
      makeBillNumberService(),
      makeDiscountsService(),
    );

    await expect(
      svc.cancelBill(
        "bill-1",
        { reason: "test", managerId: "mgr-1", pin: "123456", deviceId: "dev-1" },
        ACTOR,
        ROLE,
        { chainWide: false, branchIds: ["branch-OTHER"] },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── 6. guestCount includes free tickets ──────────────────────────────────────
  it("counts free tickets in guestCount (M7)", async () => {
    // The resolver prices by isFree: paid → 150k, free → 0.
    const pricing = {
      resolvePrice: jest.fn(),
      buildResolver: jest.fn().mockResolvedValue({
        resolve: jest.fn((_ttId: string, isFree: boolean) =>
          isFree
            ? { kind: "PRICE", priceVnd: 0, versionId: "", timeWindowId: "tw-1", dayType: "REGULAR" }
            : { kind: "PRICE", priceVnd: 150_000, versionId: "v1", timeWindowId: "tw-1", dayType: "REGULAR" },
        ),
        timeWindowName: jest.fn().mockReturnValue("Trưa"),
      }),
    } as unknown as jest.Mocked<PricingService>;

    const prisma = makePrisma({
      ticketType: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: "tt-1", name: "Người lớn", isFree: false },
          { id: "tt-free", name: "Trẻ em", isFree: true },
        ]),
      },
      timeWindow: { findUnique: jest.fn().mockResolvedValue(makeTimeWindow()) },
      shift: { findUnique: jest.fn().mockResolvedValue(makeShift()) },
      branch: { findUnique: jest.fn().mockResolvedValue(makeBranch()) },
      bill: { findUnique: jest.fn(), create: jest.fn() },
    });

    // Capture the bill create call to assert guestCount
    let capturedData: Record<string, unknown> | null = null;
    prisma._defaultTx.bill.create = jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
      capturedData = args.data;
      return {
        ...makeBill(),
        totalVnd: 150_000,
        guestCount: 3,
        lines: [],
      };
    });

    const svc = new BillsService(
      prisma as never,
      makeAuditService(),
      pricing,
      makeBillNumberService(),
      makeDiscountsService(),
    );

    await svc.createBill(
      {
        ...BASE_DTO,
        lines: [
          { ticketTypeId: "tt-1", qty: 2 },     // 2 paid
          { ticketTypeId: "tt-free", qty: 1 },  // 1 free
        ],
      },
      ACTOR,
      ROLE,
    );

    // guestCount = 2 paid + 1 free = 3
    expect(capturedData).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((capturedData as any)["guestCount"]).toBe(3);
  });

  // ── 7. Idempotency: duplicate clientUuid returns existing bill ─────────────────
  it("returns existing bill when clientUuid already exists (offline resync idempotency)", async () => {
    const existing = makeBill();
    const prisma = makePrisma({
      bill: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
      shift: { findUnique: jest.fn() },
      branch: { findUnique: jest.fn() },
      ticketType: { findUnique: jest.fn() },
      timeWindow: { findUnique: jest.fn() },
    });

    const pricing = makePricingService();
    const billNumber = makeBillNumberService();

    const svc = new BillsService(
      prisma as never,
      makeAuditService(),
      pricing,
      billNumber,
      makeDiscountsService(),
    );

    const result = await svc.createBill(
      { ...BASE_DTO, clientUuid: "uuid-offline-1" },
      ACTOR,
      ROLE,
    );

    expect(result.id).toBe("bill-1");
    // No new bill was created
    expect(prisma._defaultTx.bill.create).not.toHaveBeenCalled();
    // No number was allocated
    expect(billNumber.allocate).not.toHaveBeenCalled();
    // Pricing was not called
    expect(pricing.resolvePrice).not.toHaveBeenCalled();
  });

  // ── 8. Cancel: wrong PIN → Forbidden ──────────────────────────────────────────
  it("throws ForbiddenException when manager PIN is not approved", async () => {
    const bill = makeBill({ shift: makeShift({ status: "OPEN" }) });
    const prisma = makePrisma();
    prisma.bill.findUnique = jest.fn().mockResolvedValue(bill);

    const discounts = makeDiscountsService(false /* approved=false */);

    const svc = new BillsService(
      prisma as never,
      makeAuditService(),
      makePricingService(),
      makeBillNumberService(),
      discounts,
    );

    await expect(
      svc.cancelBill(
        "bill-1",
        { reason: "test", managerId: "mgr-1", pin: "000000", deviceId: "dev-1" },
        ACTOR,
        ROLE,
        BILL_ACCESS,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── 9. Empty lines → BadRequest ───────────────────────────────────────────────
  it("throws BadRequestException for empty lines array", async () => {
    const prisma = makePrisma();
    const svc = new BillsService(
      prisma as never,
      makeAuditService(),
      makePricingService(),
      makeBillNumberService(),
      makeDiscountsService(),
    );

    await expect(
      svc.createBill({ ...BASE_DTO, lines: [] }, ACTOR, ROLE),
    ).rejects.toThrow(BadRequestException);
  });

  // ── 10. Shift not OPEN → ConflictException ─────────────────────────────────────
  it("throws ConflictException when shift is not OPEN", async () => {
    const prisma = makePrisma({
      shift: { findUnique: jest.fn().mockResolvedValue(makeShift({ status: "CLOSED" })) },
      branch: { findUnique: jest.fn().mockResolvedValue(makeBranch()) },
      ticketType: { findUnique: jest.fn() },
      timeWindow: { findUnique: jest.fn() },
      bill: { findUnique: jest.fn(), create: jest.fn() },
    });

    const svc = new BillsService(
      prisma as never,
      makeAuditService(),
      makePricingService(),
      makeBillNumberService(),
      makeDiscountsService(),
    );

    await expect(svc.createBill(BASE_DTO, ACTOR, ROLE)).rejects.toThrow(ConflictException);
  });
});
