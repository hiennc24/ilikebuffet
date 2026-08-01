/**
 * DTOs for Payments.
 *
 * Combined payment = multiple Payment rows on a bill.
 * Sum of amountVnd must equal bill.totalVnd exactly.
 */

export type PaymentMethodDto = "CASH" | "VIETQR" | "CARD";

export interface PaymentItemDto {
  method: PaymentMethodDto;
  /** Integer VND applied to the bill, must be > 0. Sum across payments == bill total. */
  amountVnd: number;
  /**
   * Cash handed over by the customer (CASH only). When present it must be an
   * integer >= amountVnd; the server stores changeVnd = tenderedVnd - amountVnd.
   * Omit for exact-pay or non-cash methods.
   */
  tenderedVnd?: number;
  /** Bank/card reference for VietQR/CARD. Optional for CASH. */
  reference?: string;
}

export interface AddPaymentsDto {
  payments: PaymentItemDto[];
}
