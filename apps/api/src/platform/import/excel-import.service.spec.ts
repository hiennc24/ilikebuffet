/**
 * ExcelImportService unit tests (TDD — NT-03.3 + Red Team H7).
 *
 * Tests cover the ingredient import with a fixture workbook built in-memory
 * (no real file needed — the column-map config drives the parsing).
 *
 * Cases:
 *   - Valid rows only → all written, 0 errors.
 *   - Duplicate name (DB existing) → error row.
 *   - Intra-batch duplicate (same batch, normalised) → error row.
 *   - Missing required field (name) → error row.
 *   - Unknown unit code → error row.
 *   - Conversion factor ≤ 0 → error row.
 *   - Mixed valid + errors → only valid rows written atomically, error workbook produced.
 *   - Empty file → 0 rows, 0 errors.
 *
 * H7 invariant: import uses INGREDIENT_COLUMN_MAP config, not hard-coded indices.
 *   The fixture builder uses the SAME map so column reordering would still pass
 *   (the test would just rebuild the fixture in the new order).
 */
import * as ExcelJS from "exceljs";
import { BadRequestException } from "@nestjs/common";
import { ExcelImportService, INGREDIENT_COLUMN_MAP } from "./excel-import.service";

// ─── Fixture builder ──────────────────────────────────────────────────────────

/**
 * Build an in-memory xlsx buffer from a list of row objects.
 * Headers are taken from INGREDIENT_COLUMN_MAP so the test is config-driven (H7).
 */
async function buildIngredientFixture(
  rows: Array<Record<string, unknown>>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Nguyên liệu");

  // Header row driven by column map — not hard-coded.
  const headers = INGREDIENT_COLUMN_MAP.columns.map((c) => c.header);
  ws.addRow(headers);

  for (const row of rows) {
    const values = INGREDIENT_COLUMN_MAP.columns.map((c) => row[c.field] ?? "");
    ws.addRow(values);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const UNIT_KG = { id: "unit-kg", code: "KG" };
const UNIT_THUNG = { id: "unit-thung", code: "THUNG" };
const GROUP_SEAFOOD = { id: "grp-seafood", name: "Hải sản tươi" };
const GROUP_MEAT = { id: "grp-meat", name: "Thịt" };

function makePrisma(existingIngredientNames: string[] = []) {
  const createdIngredients: unknown[] = [];

  const tx = {
    ingredient: {
      findUnique: jest.fn().mockResolvedValue(null), // code not taken
      create: jest.fn().mockImplementation((args: { data: { name: string; code: string } }) => {
        const created = { id: `new-${Date.now()}-${Math.random()}`, ...args.data };
        createdIngredients.push(created);
        return Promise.resolve(created);
      }),
    },
    ingredientPurchaseUnit: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const prisma = {
    unit: {
      findMany: jest.fn().mockResolvedValue([UNIT_KG, UNIT_THUNG]),
    },
    ingredientGroup: {
      findMany: jest.fn().mockResolvedValue([GROUP_SEAFOOD, GROUP_MEAT]),
    },
    ingredient: {
      findMany: jest.fn().mockResolvedValue(
        existingIngredientNames.map((name, i) => ({ name, code: `EXIST${i}` })),
      ),
    },
    withTx: jest.fn().mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fn: (tx: any) => Promise<unknown>) => fn(tx),
    ),
    _createdIngredients: createdIngredients,
    _tx: tx,
  };

  return prisma;
}

// ─── Helper: extract just the service (prisma is injected) ───────────────────

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new ExcelImportService(prisma as never);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ExcelImportService — importIngredients()", () => {
  it("returns 0/0 for an empty file (header row only)", async () => {
    const buf = await buildIngredientFixture([]);
    const service = makeService(makePrisma());
    const result = await service.importIngredients(buf);

    expect(result.validCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.errorWorkbook).toBeUndefined();
  });

  it("writes all valid rows atomically and reports 0 errors", async () => {
    const buf = await buildIngredientFixture([
      { name: "Tôm sú", groupName: "Hải sản tươi", baseUnitCode: "KG" },
      { name: "Thịt bò", groupName: "Thịt", baseUnitCode: "KG" },
    ]);
    const prisma = makePrisma();
    const service = makeService(prisma);

    const result = await service.importIngredients(buf);

    expect(result.validCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.errorWorkbook).toBeUndefined();
    expect(prisma.withTx).toHaveBeenCalledTimes(1);
    expect(prisma._createdIngredients).toHaveLength(2);
  });

  it("detects duplicate name vs existing DB entry (normalized)", async () => {
    // "tom su" normalizes same as "Tôm sú"
    const buf = await buildIngredientFixture([
      { name: "tom su", groupName: "Hải sản tươi", baseUnitCode: "KG" },
    ]);
    const prisma = makePrisma(["Tôm sú"]); // existing in DB
    const service = makeService(prisma);

    const result = await service.importIngredients(buf);

    expect(result.validCount).toBe(0);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0]?.reasons.some((r) => r.includes("trùng"))).toBe(true);
  });

  it("detects intra-batch duplicate (two rows with same normalized name)", async () => {
    const buf = await buildIngredientFixture([
      { name: "Tôm sú", groupName: "Hải sản tươi", baseUnitCode: "KG" },
      { name: "tom su", groupName: "Thịt", baseUnitCode: "KG" }, // same normalized name
    ]);
    const prisma = makePrisma(); // no existing
    const service = makeService(prisma);

    const result = await service.importIngredients(buf);

    // First row valid; second is a duplicate.
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0]?.reasons.some((r) => r.includes("trùng"))).toBe(true);
  });

  it("reports error for missing required field (name blank)", async () => {
    const buf = await buildIngredientFixture([
      { name: "", groupName: "Hải sản tươi", baseUnitCode: "KG" },
    ]);
    const service = makeService(makePrisma());
    const result = await service.importIngredients(buf);

    expect(result.errorCount).toBe(1);
    expect(result.errors[0]?.reasons.some((r) => r.includes("Thiếu tên"))).toBe(true);
  });

  it("reports error for unknown unit code", async () => {
    const buf = await buildIngredientFixture([
      { name: "Rau muống", groupName: "Hải sản tươi", baseUnitCode: "UNKNOWN_UNIT" },
    ]);
    const service = makeService(makePrisma());
    const result = await service.importIngredients(buf);

    expect(result.errorCount).toBe(1);
    expect(result.errors[0]?.reasons.some((r) => r.includes("không tồn tại"))).toBe(true);
  });

  it("reports error for unknown group name", async () => {
    const buf = await buildIngredientFixture([
      { name: "Cá hồi", groupName: "NHÓM_KHÔNG_TỒN_TẠI", baseUnitCode: "KG" },
    ]);
    const service = makeService(makePrisma());
    const result = await service.importIngredients(buf);

    expect(result.errorCount).toBe(1);
    expect(result.errors[0]?.reasons.some((r) => r.includes("không tồn tại"))).toBe(true);
  });

  it("reports error for conversion factor <= 0 (zero)", async () => {
    const buf = await buildIngredientFixture([
      {
        name: "Bột mì",
        groupName: "Hải sản tươi",
        baseUnitCode: "KG",
        purchaseUnit1: "THUNG",
        factor1: 0, // invalid
      },
    ]);
    const service = makeService(makePrisma());
    const result = await service.importIngredients(buf);

    expect(result.errorCount).toBe(1);
    expect(result.errors[0]?.reasons.some((r) => r.includes("Hệ số"))).toBe(true);
  });

  it("reports error for conversion factor <= 0 (negative)", async () => {
    const buf = await buildIngredientFixture([
      {
        name: "Bột năng",
        groupName: "Hải sản tươi",
        baseUnitCode: "KG",
        purchaseUnit1: "THUNG",
        factor1: -5, // invalid
      },
    ]);
    const service = makeService(makePrisma());
    const result = await service.importIngredients(buf);

    expect(result.errorCount).toBe(1);
    expect(result.errors[0]?.reasons.some((r) => r.includes("Hệ số"))).toBe(true);
  });

  it("writes ONLY valid rows when batch is mixed; produces error workbook", async () => {
    const buf = await buildIngredientFixture([
      { name: "Tôm càng", groupName: "Hải sản tươi", baseUnitCode: "KG" },           // valid
      { name: "", groupName: "Hải sản tươi", baseUnitCode: "KG" },                    // missing name
      { name: "Thịt lợn", groupName: "Thịt", baseUnitCode: "KG" },                   // valid
      { name: "Cá thu", groupName: "Thịt", baseUnitCode: "BAD_UNIT" },               // bad unit
    ]);
    const prisma = makePrisma();
    const service = makeService(prisma);

    const result = await service.importIngredients(buf);

    expect(result.validCount).toBe(2);
    expect(result.errorCount).toBe(2);
    expect(result.errorWorkbook).toBeDefined();

    // Verify the error workbook is a valid xlsx.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.errorWorkbook! as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws).toBeDefined();
    // 2 error data rows + 1 header row.
    expect(ws!.rowCount).toBeGreaterThanOrEqual(3);

    // Only 2 valid rows committed.
    expect(prisma._createdIngredients).toHaveLength(2);
  });

  it("is atomic: zero rows written when ALL rows are invalid", async () => {
    const buf = await buildIngredientFixture([
      { name: "", groupName: "Hải sản tươi", baseUnitCode: "KG" },
      { name: "Cá", groupName: "Thịt", baseUnitCode: "NOPE" },
    ]);
    const prisma = makePrisma();
    const service = makeService(prisma);

    const result = await service.importIngredients(buf);

    expect(result.validCount).toBe(0);
    expect(result.errorCount).toBe(2);
    // withTx must NOT have been called (no valid rows).
    expect(prisma.withTx).not.toHaveBeenCalled();
    expect(prisma._createdIngredients).toHaveLength(0);
  });

  it("H7: column order can be changed in the map without breaking the parser", async () => {
    // Build fixture using the REVERSED column order — header row will mismatch
    // column indices but the header-based parser should still find the right values.
    const reversedMap = {
      ...INGREDIENT_COLUMN_MAP,
      columns: [...INGREDIENT_COLUMN_MAP.columns].reverse(),
    };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Test");
    // Use reversed map headers.
    ws.addRow(reversedMap.columns.map((c) => c.header));
    // Write the data using the reversed field order.
    const fields = reversedMap.columns.map((c) =>
      c.field === "name"
        ? "Cá lóc"
        : c.field === "groupName"
          ? "Hải sản tươi"
          : c.field === "baseUnitCode"
            ? "KG"
            : "",
    );
    ws.addRow(fields);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    // The original service uses INGREDIENT_COLUMN_MAP (not reversed).
    // Since headers are matched by string — not position — it should still parse.
    const service = makeService(makePrisma());
    const result = await service.importIngredients(buf);

    // All required columns matched by header → valid row.
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(0);
  });
});

// ─── parseWorkbook() edge cases ──────────────────────────────────────────────

describe("ExcelImportService — parseWorkbook()", () => {
  it("throws BadRequestException for an empty workbook (no sheets)", async () => {
    const wb = new ExcelJS.Workbook();
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const service = makeService(makePrisma());

    await expect(service.parseWorkbook(buf, INGREDIENT_COLUMN_MAP)).rejects.toThrow(
      BadRequestException,
    );
  });
});

// ─── M5: defaultMinStock invalid string → row error (not silent 0) ───────────

describe("M5 — defaultMinStock invalid string produces row error", () => {
  it("reports a row error for a non-numeric defaultMinStock string", async () => {
    const buf = await buildIngredientFixture([
      {
        name: "Rau cải",
        groupName: "Hải sản tươi",
        baseUnitCode: "KG",
        defaultMinStock: "abc", // invalid — must be a row error, not silently 0
      },
    ]);
    const service = makeService(makePrisma());
    const result = await service.importIngredients(buf);

    expect(result.errorCount).toBe(1);
    expect(result.validCount).toBe(0);
    expect(
      result.errors[0]?.reasons.some((r) => r.includes("Tồn tối thiểu")),
    ).toBe(true);
  });

  it("reports a row error for a negative defaultMinStock", async () => {
    const buf = await buildIngredientFixture([
      {
        name: "Hành tây",
        groupName: "Hải sản tươi",
        baseUnitCode: "KG",
        defaultMinStock: -10, // negative is invalid
      },
    ]);
    const service = makeService(makePrisma());
    const result = await service.importIngredients(buf);

    expect(result.errorCount).toBe(1);
    expect(
      result.errors[0]?.reasons.some((r) => r.includes("Tồn tối thiểu")),
    ).toBe(true);
  });

  it("accepts 0 as a valid defaultMinStock (minimum stock = 0 is allowed)", async () => {
    const buf = await buildIngredientFixture([
      {
        name: "Muối",
        groupName: "Hải sản tươi",
        baseUnitCode: "KG",
        defaultMinStock: 0, // zero is valid
      },
    ]);
    const service = makeService(makePrisma());
    const result = await service.importIngredients(buf);

    expect(result.errorCount).toBe(0);
    expect(result.validCount).toBe(1);
  });

  it("accepts a blank defaultMinStock cell (treated as 0 — optional field)", async () => {
    const buf = await buildIngredientFixture([
      {
        name: "Tiêu",
        groupName: "Hải sản tươi",
        baseUnitCode: "KG",
        defaultMinStock: "", // blank = omitted, defaults to 0
      },
    ]);
    const service = makeService(makePrisma());
    const result = await service.importIngredients(buf);

    expect(result.errorCount).toBe(0);
    expect(result.validCount).toBe(1);
  });
});
