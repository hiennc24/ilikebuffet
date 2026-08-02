/**
 * DTO for receiving goods against a purchase order. Each received line names an
 * ordered ingredient + purchase unit; qty and price may differ from the order
 * (partial or price-corrected deliveries). Omitting `lines` receives the PO as
 * ordered.
 */
import { IsArray, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class ReceiveLineDto {
  @IsString()
  ingredientId!: string;

  /** Must match the purchase unit on the corresponding PO line. */
  @IsString()
  unitId!: string;

  /** Received quantity in the purchase unit; finite and > 0. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive({ message: "qty phải lớn hơn 0" })
  qty!: number;

  /** Override price of one purchase unit (integer VND). Defaults to the PO line. */
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceVnd?: number;
}

export class ReceiveGoodsDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines?: ReceiveLineDto[];
}
