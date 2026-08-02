/**
 * DTOs for stock balance viewing and manual issue/adjust. Quantities are
 * fractional base units; a reason note is required on every manual movement so
 * the audit trail explains why stock changed.
 */
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class StockListQuery {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  lowOnly?: boolean;

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

export class MovementListQuery {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  ingredientId?: string;

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

export class IssueStockDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  ingredientId!: string;

  /** Quantity to remove, in base units; finite and > 0. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive({ message: "Số lượng xuất phải lớn hơn 0" })
  qty!: number;

  @IsString()
  @IsNotEmpty({ message: "Cần lý do xuất kho" })
  note!: string;
}

export class AdjustStockDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  ingredientId!: string;

  /** New counted on-hand quantity, base units; >= 0. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  newQty!: number;

  @IsString()
  @IsNotEmpty({ message: "Cần lý do điều chỉnh" })
  note!: string;
}
