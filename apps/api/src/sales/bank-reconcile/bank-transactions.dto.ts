/** DTOs for the bank-transaction reconciliation admin endpoints. */
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class BankTxListQuery {
  @IsOptional()
  @IsString()
  status?: string;

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

export class MatchBankTxDto {
  /** Human bill number to attach this transfer to (e.g. "CN01-260803-0001"). */
  @IsString()
  @IsNotEmpty()
  billNumber!: string;
}

export class IgnoreBankTxDto {
  @IsOptional()
  @IsString()
  note?: string;
}
