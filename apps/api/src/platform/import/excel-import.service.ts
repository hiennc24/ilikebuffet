/**
 * ExcelImportService — validate-before-write Excel import with pluggable column-map.
 *
 * Column mapping is driven by a ColumnMap config object, NOT hard-coded column indices.
 * This is the seam for all future import/export templates (ingredients, suppliers,
 * accounting — when real client files arrive).
 *
 * Import contract:
 *   1. Parse rows via ExcelJS.
 *   2. Validate ALL rows first: duplicate name (normalized), missing required field,
 *      unknown unit code, conversion factor ≤ 0.
 *   3. Report valid / error counts.
 *   4. Write ONLY valid rows in ONE transaction (all-or-nothing per batch).
 *   5. Produce an error workbook (same columns + "Lỗi" column) for re-submission.
 *
 * The 6 accounting export templates are NOT implemented here.
 * They are deferred pending real client files. The ColumnMap interface is the
 * extension point — add a new map when files arrive.
 */
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { PrismaService } from "../../prisma/prisma.service";
import { vnNormalize } from "@ilikebuffet/shared";
// Reuse the single crypto.randomInt-based helper from master-data service.
import { generateIngredientCode } from "../master-data/master-data.service";

// ─── Column-map config (pluggable seam) ──────────────────────────────────────

/**
 * Maps a spreadsheet column (1-based index OR header label) to a field name.
 * Header-based mapping is preferred so re-ordered columns still work.
 */
export interface ColumnDef {
  /** The exact header string in the spreadsheet (case-sensitive). */
  header: string;
  /** The field name in the target DTO. */
  field: string;
  /** If true, a missing / blank value is a validation error. */
  required?: boolean;
}

/**
 * Full column-map config for one import template.
 * Add a new ColumnMap constant for each new template (ingredient, supplier, etc.).
 */
export interface ColumnMap {
  /** Human-readable template name for error messages. */
  templateName: string;
  columns: ColumnDef[];
}

// ─── Ingredient import column map ────────────────────────────────────────────

/**
 * Standard ingredient import template.
 * Headers match the downloadable template the API will expose.
 * Changing headers here updates the template — no other code changes needed.
 */
export const INGREDIENT_COLUMN_MAP: ColumnMap = {
  templateName: "Nguyên liệu",
  columns: [
    { header: "Mã nguyên liệu", field: "code", required: false },
    { header: "Tên nguyên liệu", field: "name", required: true },
    { header: "Nhóm", field: "groupName", required: true },
    { header: "Đơn vị gốc", field: "baseUnitCode", required: true },
    { header: "Hao hụt (%)", field: "wastagePct", required: false },
    { header: "Tồn tối thiểu", field: "defaultMinStock", required: false },
    { header: "Đơn vị mua 1", field: "purchaseUnit1", required: false },
    { header: "Hệ số 1", field: "factor1", required: false },
    { header: "Đơn vị mua 2", field: "purchaseUnit2", required: false },
    { header: "Hệ số 2", field: "factor2", required: false },
    { header: "Đơn vị mua 3", field: "purchaseUnit3", required: false },
    { header: "Hệ số 3", field: "factor3", required: false },
  ],
};

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ImportRowError {
  rowNumber: number;
  /** The raw values of the row (keyed by field name). */
  data: Record<string, unknown>;
  reasons: string[];
}

export interface ImportResult {
  validCount: number;
  errorCount: number;
  errors: ImportRowError[];
  /** Set when errors exist; the caller streams this buffer as a downloadable file. */
  errorWorkbook?: Buffer;
}

// ─── Parsed row (before validation) ──────────────────────────────────────────

interface ParsedRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ExcelImportService {
  private readonly logger = new Logger(ExcelImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Import ingredients from an Excel buffer.
   *
   * Steps: parse → validate → write valid rows atomically.
   *
   * @param fileBuffer   Raw bytes of the uploaded .xlsx file.
   * @param actorId      For future audit rows on each created ingredient.
   * @returns            ImportResult with counts, errors, and optional error workbook.
   */
  async importIngredients(
    fileBuffer: Buffer,
    actorId?: string,
  ): Promise<ImportResult> {
    void actorId; // Reserved for audit rows in the full flow; ingredient.create already audits.

    // 1. Parse rows using the column map.
    const rows = await this.parseWorkbook(fileBuffer, INGREDIENT_COLUMN_MAP);
    if (rows.length === 0) {
      return { validCount: 0, errorCount: 0, errors: [] };
    }

    // 2. Load lookup catalogs once (unit codes, group names) for validation.
    const [units, groups, existingIngredients] = await Promise.all([
      this.prisma.unit.findMany({ select: { id: true, code: true } }),
      this.prisma.ingredientGroup.findMany({ select: { id: true, name: true } }),
      this.prisma.ingredient.findMany({ select: { name: true, code: true } }),
    ]);

    const unitByCode = new Map(units.map((u) => [u.code.toUpperCase(), u.id]));
    const groupByName = new Map(groups.map((g) => [g.name, g.id]));
    // Normalized set of existing ingredient names — for duplicate detection across
    // both the DB and within the current batch.
    const existingNormalized = new Set(existingIngredients.map((i) => vnNormalize(i.name)));

    // 3. Validate all rows; collect errors.
    const errors: ImportRowError[] = [];
    const valid: Array<{ row: ParsedRow; parsed: ValidatedIngredientRow }> = [];

    // Track names seen in this batch (normalized) to detect intra-batch duplicates.
    const batchNormalized = new Set<string>();

    for (const row of rows) {
      const rowErrors: string[] = [];
      const d = row.data;

      // Required fields.
      const name = String(d["name"] ?? "").trim();
      const groupName = String(d["groupName"] ?? "").trim();
      const baseUnitCode = String(d["baseUnitCode"] ?? "").trim().toUpperCase();

      if (!name) rowErrors.push("Thiếu tên nguyên liệu");
      if (!groupName) rowErrors.push("Thiếu nhóm nguyên liệu");
      if (!baseUnitCode) rowErrors.push("Thiếu đơn vị gốc");

      // Duplicate name detection: normalize then check DB + batch.
      const normalized = vnNormalize(name);
      if (name && (existingNormalized.has(normalized) || batchNormalized.has(normalized))) {
        rowErrors.push(`Tên "${name}" bị trùng (chuẩn hoá không dấu: "${normalized}")`);
      }

      // Unknown unit code.
      const unitId = unitByCode.get(baseUnitCode);
      if (baseUnitCode && !unitId) {
        rowErrors.push(`Đơn vị gốc "${baseUnitCode}" không tồn tại trong hệ thống`);
      }

      // Unknown group name.
      const groupId = groupByName.get(groupName);
      if (groupName && !groupId) {
        rowErrors.push(`Nhóm "${groupName}" không tồn tại trong hệ thống`);
      }

      // Purchase units: validate up to 3 (factor > 0, unit code known).
      const purchaseUnits: Array<{ unitId: string; factorToBase: number }> = [];
      for (let i = 1; i <= 3; i++) {
        const puCode = String(d[`purchaseUnit${i}`] ?? "").trim().toUpperCase();
        const factorRaw = d[`factor${i}`];
        if (!puCode) continue; // optional

        const puUnitId = unitByCode.get(puCode);
        if (!puUnitId) {
          rowErrors.push(`Đơn vị mua ${i} "${puCode}" không tồn tại trong hệ thống`);
          continue;
        }

        const factor = Number(factorRaw);
        if (!Number.isFinite(factor) || factor <= 0) {
          rowErrors.push(`Hệ số ${i} phải > 0 (nhận được: ${String(factorRaw ?? "")})`);
          continue;
        }

        purchaseUnits.push({ unitId: puUnitId, factorToBase: factor });
      }
      if (purchaseUnits.length > 3) {
        rowErrors.push("Tối đa 3 đơn vị mua");
      }

      // Optional numeric fields.
      const wastagePctRaw = d["wastagePct"];
      let wastagePct: number | null = null;
      if (wastagePctRaw !== undefined && wastagePctRaw !== null && String(wastagePctRaw).trim() !== "") {
        wastagePct = Number(wastagePctRaw);
        if (!Number.isFinite(wastagePct) || wastagePct < 0 || wastagePct > 100) {
          rowErrors.push(`Hao hụt % phải trong khoảng 0–100 (nhận được: ${String(wastagePctRaw)})`);
          wastagePct = null;
        }
      }

      // Invalid defaultMinStock must produce a row error, not silently coerce to 0.
      let defaultMinStock = 0;
      const minStockRaw = d["defaultMinStock"];
      if (minStockRaw !== undefined && minStockRaw !== null && String(minStockRaw).trim() !== "") {
        defaultMinStock = Number(minStockRaw);
        if (!Number.isFinite(defaultMinStock) || defaultMinStock < 0) {
          rowErrors.push(
            `Tồn tối thiểu phải là số không âm (nhận được: ${String(minStockRaw)})`,
          );
          defaultMinStock = 0; // reset; row will be in errors anyway
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ rowNumber: row.rowNumber, data: d, reasons: rowErrors });
      } else {
        // Mark name as seen in batch ONLY when the row is valid.
        batchNormalized.add(normalized);
        valid.push({
          row,
          parsed: {
            code: String(d["code"] ?? "").trim() || undefined,
            name,
            groupId: groupId!,
            unitId: unitId!,
            wastagePct,
            defaultMinStock: Number.isFinite(defaultMinStock) ? defaultMinStock : 0,
            purchaseUnits,
          },
        });
      }
    }

    this.logger.log(
      `Ingredient import: ${valid.length} valid, ${errors.length} errors out of ${rows.length} rows`,
    );

    // 4. Write valid rows atomically — all-or-nothing per batch.
    if (valid.length > 0) {
      await this.prisma.withTx(async (tx) => {
        for (const { parsed } of valid) {
          // Auto-generate code if not provided — uses the shared crypto.randomInt helper.
          const code = parsed.code ?? (await generateIngredientCode(tx));

          const ingredient = await tx.ingredient.create({
            data: {
              code,
              name: parsed.name,
              groupId: parsed.groupId,
              unitId: parsed.unitId,
              wastagePct: parsed.wastagePct ?? null,
              defaultMinStock: parsed.defaultMinStock,
            },
          });

          if (parsed.purchaseUnits.length > 0) {
            await tx.ingredientPurchaseUnit.createMany({
              data: parsed.purchaseUnits.map((pu) => ({
                ingredientId: ingredient.id,
                unitId: pu.unitId,
                factorToBase: pu.factorToBase,
              })),
            });
          }
        }
      });
    }

    // 5. Produce error workbook for rows that failed.
    let errorWorkbook: Buffer | undefined;
    if (errors.length > 0) {
      errorWorkbook = await this.buildErrorWorkbook(errors, INGREDIENT_COLUMN_MAP);
    }

    return {
      validCount: valid.length,
      errorCount: errors.length,
      errors,
      errorWorkbook,
    };
  }

  // ─── Generic workbook parser ────────────────────────────────────────────────

  /**
   * Parse an Excel workbook using the given ColumnMap.
   * Reads the first worksheet; uses the header row (row 1) to locate columns.
   * Returns rows starting from row 2 (row 1 = headers).
   */
  async parseWorkbook(buffer: Buffer, columnMap: ColumnMap): Promise<ParsedRow[]> {
    const wb = new ExcelJS.Workbook();
    // ExcelJS load() expects an ArrayBuffer; Node Buffer satisfies that interface.
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    const ws = wb.worksheets[0];
    if (!ws) {
      throw new BadRequestException(
        `Workbook is empty — expected template "${columnMap.templateName}"`,
      );
    }

    // Build header → column index map from row 1.
    const headerRow = ws.getRow(1);
    const headerIndex = new Map<string, number>(); // field → col index (1-based)

    headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
      const cellText = String(cell.value ?? "").trim();
      const colDef = columnMap.columns.find((c) => c.header === cellText);
      if (colDef) {
        headerIndex.set(colDef.field, colNum);
      }
    });

    // Verify required headers are present.
    for (const colDef of columnMap.columns) {
      if (colDef.required && !headerIndex.has(colDef.field)) {
        throw new BadRequestException(
          `Column "${colDef.header}" is required in template "${columnMap.templateName}" but was not found`,
        );
      }
    }

    const rows: ParsedRow[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) return; // skip header

      const data: Record<string, unknown> = {};
      for (const colDef of columnMap.columns) {
        const colIdx = headerIndex.get(colDef.field);
        if (colIdx === undefined) continue;
        const cell = row.getCell(colIdx);
        // Unwrap rich-text / formula results.
        const value = cell.type === ExcelJS.ValueType.RichText
          ? (cell.value as ExcelJS.CellRichTextValue).richText.map((rt) => rt.text).join("")
          : cell.value;
        data[colDef.field] = value;
      }

      // Skip entirely blank rows.
      const hasData = Object.values(data).some(
        (v) => v !== null && v !== undefined && String(v).trim() !== "",
      );
      if (hasData) {
        rows.push({ rowNumber: rowNum, data });
      }
    });

    return rows;
  }

  // ─── Error workbook builder ─────────────────────────────────────────────────

  /**
   * Build an error workbook: original columns + "Lỗi" column appended.
   * Re-submittable: the user fixes error rows and re-uploads the fixed file.
   */
  async buildErrorWorkbook(
    errors: ImportRowError[],
    columnMap: ColumnMap,
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Lỗi nhập liệu");

    // Header row: original headers + "Lỗi".
    const headers = [...columnMap.columns.map((c) => c.header), "Lỗi"];
    ws.addRow(headers);

    // Style header.
    const headerRowWs = ws.getRow(1);
    headerRowWs.font = { bold: true };
    headerRowWs.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFCC00" },
    };

    // Data rows.
    for (const err of errors) {
      const rowValues = columnMap.columns.map((c) => err.data[c.field] ?? "");
      rowValues.push(err.reasons.join("; "));
      ws.addRow(rowValues);
    }

    // Auto-width (approximate).
    ws.columns.forEach((col) => {
      col.width = 20;
    });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}

// ─── Internal validated type ──────────────────────────────────────────────────

interface ValidatedIngredientRow {
  code?: string;
  name: string;
  groupId: string;
  unitId: string;
  wastagePct: number | null;
  defaultMinStock: number;
  purchaseUnits: Array<{ unitId: string; factorToBase: number }>;
}
