/**
 * DTOs for Bills and Payments (BH-02, BH-03, BH-06).
 *
 * Note: client NEVER sends price fields — server prices everything.
 * DTO has no unitPriceVnd, no lineTotalVnd, no totalVnd.
 */

// ─── Bill create ──────────────────────────────────────────────────────────────

export interface CreateBillLineDto {
  ticketTypeId: string;
  qty: number;
}

export interface CreateBillDto {
  branchId: string;
  deviceId: string;
  shiftId: string;
  lines: CreateBillLineDto[];
  /** Offline dedup key (P8). When provided, duplicate create returns existing bill. */
  clientUuid?: string;
}

// ─── Bill cancel ──────────────────────────────────────────────────────────────

export interface CancelBillDto {
  reason: string;
  /** QUAN_LY_CN user id whose approval PIN is being used. */
  managerId: string;
  pin: string;
  /** Device id of the caller — must match bill.deviceId (IDOR guard BH-06.2). */
  deviceId: string;
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export type PaymentMethodDto = "CASH" | "VIETQR" | "CARD";

export interface PaymentItemDto {
  method: PaymentMethodDto;
  amountVnd: number;
  reference?: string;
}

export interface AddPaymentsDto {
  payments: PaymentItemDto[];
}
