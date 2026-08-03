/**
 * Sepay bank-transfer webhook payload. All fields are declared so the global
 * ValidationPipe (whitelist: true) doesn't strip them before we persist the raw
 * body for audit. Only transferType/transferAmount/id/content drive behaviour.
 */
import { IsInt, IsOptional, IsString } from "class-validator";

export class SepayWebhookDto {
  /** Sepay's own transaction id — the idempotency key. */
  @IsInt()
  id!: number;

  @IsOptional()
  @IsString()
  gateway?: string;

  /** Local time "YYYY-MM-DD HH:mm:ss" (VN). */
  @IsOptional()
  @IsString()
  transactionDate?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  subAccount?: string | null;

  @IsOptional()
  @IsString()
  code?: string | null;

  /** Transfer memo — matched against the bill number. */
  @IsString()
  content!: string;

  /** "in" = incoming (a customer payment); "out" is ignored. */
  @IsString()
  transferType!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  transferAmount!: number;

  @IsOptional()
  @IsString()
  referenceCode?: string;

  @IsOptional()
  @IsInt()
  accumulated?: number;
}
