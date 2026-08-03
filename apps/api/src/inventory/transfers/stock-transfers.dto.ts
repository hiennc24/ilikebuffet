/**
 * DTOs for inter-branch stock transfers. Quantities are fractional base units;
 * the source unit cost is snapshotted server-side (not client-supplied).
 */
import { IsArray, ArrayNotEmpty, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class TransferLineDto {
  @IsString()
  @IsNotEmpty()
  ingredientId!: string;

  /** Quantity to move, in base units; finite and > 0. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive({ message: "qtyBase phải lớn hơn 0" })
  qtyBase!: number;
}

export class CreateTransferDto {
  @IsString()
  @IsNotEmpty()
  fromBranchId!: string;

  @IsString()
  @IsNotEmpty()
  toBranchId!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayNotEmpty({ message: "Phiếu chuyển phải có ít nhất 1 dòng" })
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];
}

export class TransferListQuery {
  @IsOptional()
  @IsString()
  branchId?: string;

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
