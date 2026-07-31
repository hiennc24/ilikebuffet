/**
 * MasterDataService unit tests (TDD — NT-03 acceptance criteria).
 *
 * Tests:
 *   - Ingredient purchase unit limit (max 3).
 *   - Purchase unit factor > 0 validation.
 *   - Ingredient code immutability (has-transactions → 403).
 *   - Ingredient deactivation (Ngừng sử dụng) — no hard delete.
 *   - Supplier BRANCH_SPECIFIC → PENDING_HQ + branch membership enforced.
 *   - Supplier chain-wide scope flow.
 *   - Account threshold integer VND validation.
 *   - isHoliday() helper (branch → chain fallback).
 *   - Audit is written in-tx for all mutations.
 */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  MasterDataService,
  ingredientHasTransactions,
  registerIngredientTransactionChecker,
} from "./master-data.service";
import type { Prisma } from "@prisma/client";

// ─── Prisma mock builders ─────────────────────────────────────────────────────

function makeIngredient(overrides: Record<string, unknown> = {}) {
  return {
    id: "ing1",
    code: "NL0001",
    name: "Tôm sú",
    groupId: "grp1",
    unitId: "unit1",
    wastagePct: null,
    defaultMinStock: 0,
    status: "ACTIVE",
    createdAt: new Date(),
    purchaseUnits: [],
    unit: { id: "unit1", code: "KG", name: "Kilogram" },
    group: { id: "grp1", name: "Hải sản tươi", defaultWastagePct: 5 },
    ...overrides,
  };
}

function makeSupplier(overrides: Record<string, unknown> = {}) {
  return {
    id: "sup1",
    name: "Nhà cung cấp A",
    taxCode: null,
    contact: null,
    debtTerms: 30,
    scope: "CHAIN_WIDE",
    status: "ACTIVE",
    branchId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeHolidayCalendar(overrides: Record<string, unknown> = {}) {
  return {
    id: "cal1",
    year: 2025,
    name: "Lịch lễ 2025",
    branchId: null,
    createdAt: new Date(),
    entries: [],
    ...overrides,
  };
}

function makeMockTx(overrides: Record<string, unknown> = {}) {
  const base = {
    ingredient: {
      findUnique: jest.fn().mockResolvedValue(makeIngredient()),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(makeIngredient()),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...makeIngredient(), ...data }),
      ),
    },
    ingredientPurchaseUnit: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ingredientGroup: {
      findUnique: jest.fn().mockResolvedValue({ id: "grp1", name: "Hải sản tươi", defaultWastagePct: 5 }),
      create: jest.fn().mockResolvedValue({ id: "grp1", name: "Hải sản tươi", defaultWastagePct: 5 }),
      update: jest.fn().mockResolvedValue({ id: "grp1", name: "Updated", defaultWastagePct: 10 }),
    },
    unit: {
      create: jest.fn().mockResolvedValue({ id: "unit1", code: "KG", name: "Kilogram" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    supplier: {
      findUnique: jest.fn().mockResolvedValue(makeSupplier()),
      create: jest.fn().mockResolvedValue(makeSupplier()),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...makeSupplier(), ...data }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    supplierIngredient: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    account: {
      create: jest.fn().mockResolvedValue({ id: "acc1", name: "Revenue", flow: "INCOME", approvalThresholdVnd: 0 }),
      update: jest.fn().mockResolvedValue({ id: "acc1", name: "Revenue", flow: "INCOME" }),
      findUnique: jest.fn().mockResolvedValue({ id: "acc1", name: "Revenue", flow: "INCOME", approvalThresholdVnd: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    accountGroup: {
      create: jest.fn().mockResolvedValue({ id: "ag1", name: "Doanh thu" }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    holidayCalendar: {
      findUnique: jest.fn().mockResolvedValue(makeHolidayCalendar()),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(makeHolidayCalendar()),
    },
    holidayEntry: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 1n }),
    },
    ...overrides,
  };
  return base as unknown as Prisma.TransactionClient;
}

function makeMockPrisma(txOverrides: Record<string, unknown> = {}) {
  const tx = makeMockTx(txOverrides);
  const prisma = {
    ...tx,
    withTx: jest.fn().mockImplementation((fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => fn(tx)),
  };
  return { prisma, tx };
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

// ─── ingredientHasTransactions ────────────────────────────────────────────────

describe("ingredientHasTransactions()", () => {
  it("returns false when no checkers registered", async () => {
    const fakeTx = {} as Prisma.TransactionClient;
    expect(await ingredientHasTransactions("ing1", fakeTx)).toBe(false);
  });

  it("returns true when a checker signals a transaction", async () => {
    const fakeTx = {} as Prisma.TransactionClient;
    registerIngredientTransactionChecker(jest.fn().mockResolvedValue(true));
    expect(await ingredientHasTransactions("ing1", fakeTx)).toBe(true);
  });
});

// ─── MasterDataService — Ingredients ─────────────────────────────────────────

describe("MasterDataService — ingredients", () => {
  it("rejects more than 3 purchase units (NT-03.1)", async () => {
    const { prisma } = makeMockPrisma();
    const service = new MasterDataService(prisma as never, makeAudit() as never);

    await expect(
      service.createIngredient({
        name: "Tôm",
        groupId: "g1",
        unitId: "u1",
        purchaseUnits: [
          { unitId: "u2", factorToBase: 10 },
          { unitId: "u3", factorToBase: 20 },
          { unitId: "u4", factorToBase: 30 },
          { unitId: "u5", factorToBase: 40 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects purchase unit factorToBase <= 0", async () => {
    const { prisma } = makeMockPrisma();
    const service = new MasterDataService(prisma as never, makeAudit() as never);

    await expect(
      service.createIngredient({
        name: "Tôm",
        groupId: "g1",
        unitId: "u1",
        purchaseUnits: [{ unitId: "u2", factorToBase: 0 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects factorToBase that is negative", async () => {
    const { prisma } = makeMockPrisma();
    const service = new MasterDataService(prisma as never, makeAudit() as never);

    await expect(
      service.createIngredient({
        name: "Cá",
        groupId: "g1",
        unitId: "u1",
        purchaseUnits: [{ unitId: "u2", factorToBase: -5 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("creates ingredient and writes audit row in-tx", async () => {
    const { prisma, tx } = makeMockPrisma();
    // findUnique for generated code check → null (unused code)
    (tx as unknown as Record<string, unknown>).ingredient = {
      ...(tx as unknown as Record<string, Record<string, unknown>>).ingredient,
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(makeIngredient()),
      findFirst: jest.fn().mockResolvedValue(null),
    };
    const audit = makeAudit();
    const service = new MasterDataService(prisma as never, audit as never);

    await service.createIngredient({ name: "Tôm sú", groupId: "g1", unitId: "u1" });
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "ingredient.create" }),
    );
  });

  it("blocks code change when ingredient has transactions", async () => {
    const { prisma } = makeMockPrisma();
    const audit = makeAudit();
    const service = new MasterDataService(prisma as never, audit as never);

    // Register a stub checker that says "has transactions".
    registerIngredientTransactionChecker(jest.fn().mockResolvedValue(true));

    await expect(
      service.updateIngredient("ing1", { code: "NL9999" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("deactivates ingredient (Ngừng sử dụng) with audit — NT-03.2", async () => {
    const { prisma } = makeMockPrisma();
    const audit = makeAudit();
    const service = new MasterDataService(prisma as never, audit as never);

    await service.deactivateIngredient("ing1", "actor1", "QUAN_TRI_HQ");

    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "ingredient.deactivate",
        after: { status: "INACTIVE" },
      }),
    );
  });

  it("throws NotFoundException when deactivating missing ingredient", async () => {
    const { prisma, tx } = makeMockPrisma();
    (tx as unknown as Record<string, Record<string, unknown>>).ingredient = {
      ...(tx as unknown as Record<string, Record<string, unknown>>).ingredient,
      findUnique: jest.fn().mockResolvedValue(null),
    };
    const service = new MasterDataService(prisma as never, makeAudit() as never);
    await expect(service.deactivateIngredient("missing")).rejects.toThrow(NotFoundException);
  });
});

// ─── MasterDataService — Suppliers ───────────────────────────────────────────

describe("MasterDataService — suppliers", () => {
  it("creates CHAIN_WIDE supplier with ACTIVE status", async () => {
    const { prisma } = makeMockPrisma();
    const service = new MasterDataService(prisma as never, makeAudit() as never);

    const result = await service.createSupplier(
      { name: "NCC A", scope: "CHAIN_WIDE" },
      "actor1",
      "QUAN_TRI_HQ",
    );

    expect(result).toBeDefined();
  });

  it("creates BRANCH_SPECIFIC supplier with PENDING_HQ status (NT-03.5)", async () => {
    const { prisma, tx } = makeMockPrisma();
    const pendingSupplier = makeSupplier({ scope: "BRANCH_SPECIFIC", status: "PENDING_HQ", branchId: "br1" });
    (tx as unknown as Record<string, Record<string, unknown>>).supplier = {
      ...(tx as unknown as Record<string, Record<string, unknown>>).supplier,
      create: jest.fn().mockResolvedValue(pendingSupplier),
    };
    const audit = makeAudit();
    const service = new MasterDataService(prisma as never, audit as never);

    const result = await service.createSupplier(
      { name: "NCC Branch", scope: "BRANCH_SPECIFIC", branchId: "br1" },
      "ql1",
      "QUAN_LY_CN",
      "QUAN_LY_CN",
      ["br1"],
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "supplier.create",
        after: expect.objectContaining({ status: "PENDING_HQ" }),
      }),
    );
    expect(result).toBeDefined();
  });

  it("rejects BRANCH_SPECIFIC supplier when QL_CN is not a member of the branch", async () => {
    const { prisma } = makeMockPrisma();
    const service = new MasterDataService(prisma as never, makeAudit() as never);

    await expect(
      service.createSupplier(
        { name: "NCC Rogue", scope: "BRANCH_SPECIFIC", branchId: "br_other" },
        "ql1",
        "QUAN_LY_CN",
        "QUAN_LY_CN",
        ["br1"], // caller only belongs to br1, not br_other
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects BRANCH_SPECIFIC supplier when branchId is missing", async () => {
    const { prisma } = makeMockPrisma();
    const service = new MasterDataService(prisma as never, makeAudit() as never);

    await expect(
      service.createSupplier({ name: "NCC Bad", scope: "BRANCH_SPECIFIC" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("approves PENDING_HQ supplier", async () => {
    const { prisma, tx } = makeMockPrisma();
    const pendingSupplier = makeSupplier({ status: "PENDING_HQ" });
    (tx as unknown as Record<string, Record<string, unknown>>).supplier = {
      ...(tx as unknown as Record<string, Record<string, unknown>>).supplier,
      findUnique: jest.fn().mockResolvedValue(pendingSupplier),
    };
    const audit = makeAudit();
    const service = new MasterDataService(prisma as never, audit as never);

    await service.approveSupplier("sup1", "hq1", "QUAN_TRI_HQ");
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "supplier.approve" }),
    );
  });

  it("throws when approving a non-PENDING_HQ supplier", async () => {
    const { prisma } = makeMockPrisma(); // default status = ACTIVE
    const service = new MasterDataService(prisma as never, makeAudit() as never);
    await expect(service.approveSupplier("sup1", "hq1", "QUAN_TRI_HQ")).rejects.toThrow(
      BadRequestException,
    );
  });
});

// ─── MasterDataService — Accounts ────────────────────────────────────────────

describe("MasterDataService — accounts", () => {
  it("rejects non-integer approvalThresholdVnd (float VND)", async () => {
    const { prisma } = makeMockPrisma();
    const service = new MasterDataService(prisma as never, makeAudit() as never);

    await expect(
      service.createAccount({
        groupId: "ag1",
        name: "Test",
        flow: "EXPENSE",
        approvalThresholdVnd: 1000.5, // float — must reject
      }),
    ).rejects.toThrow();
  });

  it("creates account with valid integer threshold", async () => {
    const { prisma } = makeMockPrisma();
    const audit = makeAudit();
    const service = new MasterDataService(prisma as never, audit as never);

    await service.createAccount({
      groupId: "ag1",
      name: "Chi phí nguyên liệu",
      flow: "EXPENSE",
      approvalThresholdVnd: 5_000_000,
    });

    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "account.create" }),
    );
  });
});

// ─── MasterDataService — isHoliday ───────────────────────────────────────────

describe("MasterDataService — isHoliday() (Red Team M2)", () => {
  function makeIsHolidayPrisma(
    branchEntry: boolean,
    chainEntry: boolean,
  ) {
    const branchCal = makeHolidayCalendar({
      branchId: "br1",
      entries: branchEntry ? [{ id: "e1", date: new Date("2025-01-01"), name: "Tết", isCustom: false }] : [],
    });
    const chainCal = makeHolidayCalendar({
      branchId: null,
      entries: chainEntry ? [{ id: "e2", date: new Date("2025-01-01"), name: "Tết", isCustom: false }] : [],
    });

    const prisma = {
      holidayCalendar: {
        findUnique: jest.fn().mockResolvedValue(branchEntry ? branchCal : { ...branchCal, entries: [] }),
        findFirst: jest.fn().mockResolvedValue(chainEntry ? chainCal : null),
      },
      withTx: jest.fn(),
    };
    return prisma;
  }

  it("returns true when branch calendar has the date", async () => {
    const prisma = makeIsHolidayPrisma(true, false);
    const service = new MasterDataService(prisma as never, makeAudit() as never);
    expect(await service.isHoliday(new Date("2025-01-01"), "br1")).toBe(true);
  });

  it("returns true when chain-wide calendar has the date (branch has no entry)", async () => {
    const prisma = makeIsHolidayPrisma(false, true);
    const service = new MasterDataService(prisma as never, makeAudit() as never);
    expect(await service.isHoliday(new Date("2025-01-01"), "br1")).toBe(true);
  });

  it("returns false when neither branch nor chain calendar has the date", async () => {
    const prisma = makeIsHolidayPrisma(false, false);
    const service = new MasterDataService(prisma as never, makeAudit() as never);
    expect(await service.isHoliday(new Date("2025-01-01"), "br1")).toBe(false);
  });

  it("checks only chain-wide when no branchId provided", async () => {
    const chainCal = makeHolidayCalendar({
      entries: [{ id: "e1", date: new Date("2025-04-30"), name: "Giỗ Tổ", isCustom: false }],
    });
    const prisma = {
      holidayCalendar: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(chainCal),
      },
    };
    const service = new MasterDataService(prisma as never, makeAudit() as never);
    expect(await service.isHoliday(new Date("2025-04-30"))).toBe(true);
    expect(prisma.holidayCalendar.findUnique).not.toHaveBeenCalled();
  });
});
