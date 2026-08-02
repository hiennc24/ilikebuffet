/**
 * DTOs for purchase-order endpoints. Classes with class-validator decorators so
 * the global ValidationPipe enforces the trust boundary at HTTP ingress —
 * quantities must be finite > 0, prices non-negative integer VND.
 */
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsInt,
  IsNumber,
  IsPositive,
  Min,
  ArrayNotEmpty,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class PurchaseOrderLineDto {
  @IsString()
  @IsNotEmpty()
  ingredientId!: string;

  /** Purchase unit for this line (an ingredient's configured purchase unit). */
  @IsString()
  @IsNotEmpty()
  unitId!: string;

  /** Ordered quantity in the purchase unit; finite and > 0. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive({ message: "qty phải lớn hơn 0" })
  qty!: number;

  /** Price of one purchase unit, integer VND >= 0. */
  @IsInt()
  @Min(0)
  unitPriceVnd!: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayNotEmpty({ message: "Đơn mua phải có ít nhất 1 dòng" })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];
}

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: "Đơn mua phải có ít nhất 1 dòng" })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines?: PurchaseOrderLineDto[];
}

export class PurchaseOrderListQuery {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  q?: string;

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
