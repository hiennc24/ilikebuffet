/**
 * DTOs for income/expense (thu-chi) entries. Money is integer VND; the account's
 * flow is derived server-side; managerId/pin are only needed when the amount
 * exceeds the account's approval threshold.
 */
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

const METHODS = ["CASH", "VIETQR", "CARD"] as const;

export class CreateFinancialDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  accountId!: string;

  /** Positive integer đồng. */
  @IsInt()
  @Min(1)
  amountVnd!: number;

  @IsIn(METHODS)
  method!: (typeof METHODS)[number];

  /** ISO date/time; defaults to now when omitted. */
  @IsOptional()
  @IsString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** Optional supplier link (a supplier payment). */
  @IsOptional()
  @IsString()
  supplierId?: string;

  // ── Over-threshold approval (only when amount > account threshold) ──
  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsString()
  pin?: string;
}

export class FinancialListQuery {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsIn(["INCOME", "EXPENSE"])
  flow?: "INCOME" | "EXPENSE";

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
