/**
 * DTOs for Bills and Payments.
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
  /** Offline dedup key. When provided, duplicate create returns existing bill. */
  clientUuid?: string;
}

// ─── Bill cancel ──────────────────────────────────────────────────────────────

export interface CancelBillDto {
  reason: string;
  /** QUAN_LY_CN user id whose approval PIN is being used. */
  managerId: string;
  pin: string;
  /** Device id of the caller — must match bill.deviceId (IDOR guard). */
  deviceId: string;
}

// ─── Bill list (admin Orders) ───────────────────────────────────────────────

export interface BillListQuery {
  branchId?: string;
  /** Business-date range (inclusive), "YYYY-MM-DD". */
  from?: string;
  to?: string;
  status?: "COMPLETED" | "CANCELLED";
  /** Search by bill number or temp number (contains). */
  q?: string;
  /** "true" → only quarantined bills. */
  quarantined?: string;
  page?: string;
  pageSize?: string;
}

// ─── Refund ───────────────────────────────────────────────────────────────────

export interface RefundBillDto {
  /** Integer VND to refund. sum(existing refunds) + this ≤ bill.totalVnd. */
  amountVnd: number;
  method: PaymentMethodDto;
  reason: string;
  /** Manager whose approval PIN authorises the refund. */
  managerId: string;
  pin: string;
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
