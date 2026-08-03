/**
 * DTOs for ticket-type recipe (định mức) management. A recipe is the full set of
 * ingredient consumptions per one ticket; PUT replaces it wholesale.
 */
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class RecipeLineDto {
  @IsString()
  @IsNotEmpty()
  ingredientId!: string;

  /** Estimated base-unit consumption per one ticket; finite and > 0. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive({ message: "qtyBase phải lớn hơn 0" })
  qtyBase!: number;
}

export class SetRecipeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines!: RecipeLineDto[];
}

export class RecipeListQuery {
  @IsOptional()
  @IsString()
  ticketTypeId?: string;

  /** null/omitted = chain-wide default; a branch id = that branch's override. */
  @IsOptional()
  @IsString()
  branchId?: string;
}
