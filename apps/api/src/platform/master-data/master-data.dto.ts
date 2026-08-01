/**
 * DTOs for master-data endpoints.
 *
 * Classes with class-validator decorators so the global ValidationPipe
 * enforces the trust boundary at HTTP ingress.
 */
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsArray,
  IsNumber,
  IsInt,
  IsBoolean,
  IsPositive,
  Min,
  Max,
  ArrayMaxSize,
  ValidateNested,
  Matches,
} from "class-validator";
import { Type } from "class-transformer";

// ─── Units ────────────────────────────────────────────────────────────────────

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  code!: string; // e.g. "KG", "LIT", "CAI"

  @IsString()
  @IsNotEmpty()
  name!: string; // e.g. "Kilogram", "Lít"
}

// ─── Ingredient Groups ────────────────────────────────────────────────────────

export class CreateIngredientGroupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  defaultWastagePct?: number; // 0–100, default 0
}

export class UpdateIngredientGroupDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  defaultWastagePct?: number;
}

// ─── Ingredients ──────────────────────────────────────────────────────────────

export class PurchaseUnitDto {
  @IsString()
  @IsNotEmpty()
  unitId!: string;

  /**
   * factorToBase must be a finite number strictly > 0.
   * IsNumber({ allowNaN: false, allowInfinity: false }) rejects NaN/Infinity at the
   * HTTP boundary before service logic is reached (NaN passes `<= 0`).
   * @IsPositive() additionally rejects 0 and negatives.
   */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive({ message: "factorToBase must be > 0" })
  factorToBase!: number;
}

export class CreateIngredientDto {
  /** Auto-generated if omitted; editable before first transaction. */
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  groupId!: string;

  @IsString()
  @IsNotEmpty()
  unitId!: string; // base unit

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  wastagePct?: number | null; // null = inherit from group

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  defaultMinStock?: number;

  /** Up to 3 purchase units. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3, { message: "At most 3 purchase units allowed (NT-03.1)" })
  @ValidateNested({ each: true })
  @Type(() => PurchaseUnitDto)
  purchaseUnits?: PurchaseUnitDto[];
}

export class UpdateIngredientDto {
  /** Code editable only before first transaction (enforced in service). */
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  unitId?: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  wastagePct?: number | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  defaultMinStock?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3, { message: "At most 3 purchase units allowed (NT-03.1)" })
  @ValidateNested({ each: true })
  @Type(() => PurchaseUnitDto)
  purchaseUnits?: PurchaseUnitDto[];
}

export class IngredientListQuery {
  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: "ACTIVE" | "INACTIVE";

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

// ─── Chart of accounts ───────────────────────────────────────────────────────

export class CreateAccountGroupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  groupId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(["INCOME", "EXPENSE"])
  flow!: "INCOME" | "EXPENSE"; // Thu / Chi

  /**
   * Approval threshold in integer VND. 0 = no threshold.
   * Must be a non-negative safe integer (money rule — no floats).
   */
  @IsOptional()
  @IsInt({ message: "approvalThresholdVnd must be an integer (integer VND, no floats)" })
  @Min(0)
  approvalThresholdVnd?: number;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsIn(["INCOME", "EXPENSE"])
  flow?: "INCOME" | "EXPENSE";

  @IsOptional()
  @IsInt({ message: "approvalThresholdVnd must be an integer (integer VND, no floats)" })
  @Min(0)
  approvalThresholdVnd?: number;
}

export class AccountListQuery {
  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsIn(["INCOME", "EXPENSE"])
  flow?: "INCOME" | "EXPENSE";

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  taxCode?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  debtTerms?: number; // days

  /** "CHAIN_WIDE" = HQ creates; "BRANCH_SPECIFIC" = QL_CN creates for own branch. */
  @IsIn(["CHAIN_WIDE", "BRANCH_SPECIFIC"])
  scope!: "CHAIN_WIDE" | "BRANCH_SPECIFIC";

  /** Required when scope = "BRANCH_SPECIFIC". */
  @IsOptional()
  @IsString()
  branchId?: string;

  /** Ingredient IDs this supplier provides. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ingredientIds?: string[];
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  taxCode?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  debtTerms?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ingredientIds?: string[];
}

export class SupplierListQuery {
  @IsOptional()
  @IsIn(["CHAIN_WIDE", "BRANCH_SPECIFIC"])
  scope?: "CHAIN_WIDE" | "BRANCH_SPECIFIC";

  @IsOptional()
  @IsIn(["ACTIVE", "PENDING_HQ", "INACTIVE"])
  status?: "ACTIVE" | "PENDING_HQ" | "INACTIVE";

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

// ─── Holiday calendar ─────────────────────────────────────────────────────────

export class CreateHolidayCalendarDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  branchId?: string; // null/omitted = chain-wide
}

export class HolidayEntryDto {
  /**
   * ISO "YYYY-MM-DD" date string.
   * Validated as a pattern before passing to new Date() (prevents garbage dates).
   */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date must be YYYY-MM-DD" })
  date!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;
}

export class UpsertHolidayEntriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HolidayEntryDto)
  entries!: HolidayEntryDto[];
}
