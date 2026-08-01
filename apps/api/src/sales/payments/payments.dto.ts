/**
 * DTOs for Payments (BH-03).
 *
 * Combined payment = multiple Payment rows on a bill.
 * Sum of amountVnd must equal bill.totalVnd exactly.
 */

export type PaymentMethodDto = "CASH" | "VIETQR" | "CARD";

export interface PaymentItemDto {
  method: PaymentMethodDto;
  /** Integer VND, must be > 0. */
  amountVnd: number;
  /** Bank/card reference for VietQR/CARD. Optional for CASH. */
  reference?: string;
}

export interface AddPaymentsDto {
  payments: PaymentItemDto[];
}
