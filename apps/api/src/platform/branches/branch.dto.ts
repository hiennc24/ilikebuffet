/**
 * DTOs for Branch CRUD endpoints.
 *
 * Using classes with class-validator decorators so the global ValidationPipe
 * enforces the trust boundary at HTTP ingress.
 */
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsIn,
  MaxLength,
  MinLength,
  Matches,
  IsUrl,
  IsInt,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

/** Weekday keys for operatingHours. */
export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export class DayHoursDto {
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "open must be HH:mm" })
  open!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "close must be HH:mm" })
  close!: string;
}

/** Optional bank account JSON (for VietQR). */
export class BankAccountDto {
  @IsString()
  @IsNotEmpty()
  number!: string;

  @IsString()
  @IsNotEmpty()
  bank!: string;

  @IsString()
  @IsNotEmpty()
  holder!: string;
}

// Keep the plain interface type alias for internal use (non-HTTP paths).
export type BankAccount = BankAccountDto;

export class CreateBranchDto {
  /** 2–5 uppercase alphanumeric characters starting with a letter, e.g. "CN01". */
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(5)
  @Matches(/^[A-Z][A-Z0-9]{1,4}$/, {
    message: "code must be 2–5 uppercase alphanumeric characters starting with a letter",
  })
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  /** Per-weekday open/close. Omitted day = closed. Validated as a plain object. */
  @IsOptional()
  @IsObject()
  operatingHours?: Partial<Record<Weekday, DayHoursDto>>;

  @IsOptional()
  @ValidateNested()
  @Type(() => BankAccountDto)
  bankAccount?: BankAccountDto;

  @IsOptional()
  @IsObject()
  billInfo?: Record<string, unknown>;

  @IsOptional()
  @IsUrl({}, { message: "logoUrl must be a valid URL" })
  logoUrl?: string;

  /** PO approval threshold in integer VND. A PO over this must be approved before
   *  sending; 0 (default) = every PO needs approval. */
  @IsOptional()
  @IsInt()
  @Min(0)
  poApprovalThresholdVnd?: number;

  /** Copy configuration (not transaction data) from this branch. */
  @IsOptional()
  @IsString()
  copyFromBranchId?: string;
}

export class UpdateBranchDto {
  /** Code changes are allowed ONLY if the branch has no transactions (enforced in service). */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(5)
  @Matches(/^[A-Z][A-Z0-9]{1,4}$/, {
    message: "code must be 2–5 uppercase alphanumeric characters starting with a letter",
  })
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsObject()
  operatingHours?: Partial<Record<Weekday, DayHoursDto>>;

  @IsOptional()
  @ValidateNested()
  @Type(() => BankAccountDto)
  bankAccount?: BankAccountDto | null;

  @IsOptional()
  @IsObject()
  billInfo?: Record<string, unknown> | null;

  @IsOptional()
  logoUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  poApprovalThresholdVnd?: number;
}

export class ChangeBranchStatusDto {
  @IsIn(["ACTIVE", "SUSPENDED", "CLOSED"])
  status!: "ACTIVE" | "SUSPENDED" | "CLOSED";

  @IsOptional()
  @IsString()
  reason?: string;
}

export class BranchListQuery {
  @IsOptional()
  @IsIn(["ACTIVE", "SUSPENDED", "CLOSED"])
  status?: "ACTIVE" | "SUSPENDED" | "CLOSED";

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
