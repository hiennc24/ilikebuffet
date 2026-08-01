/**
 * DTOs for discount programs, reasons, voucher redemption, and approval PIN (VG-03).
 */

export type DiscountKindDto = "PERCENT" | "FIXED_AMOUNT" | "VOUCHER";

export interface CreateDiscountProgramDto {
  name: string;
  kind: DiscountKindDto;
  /** Required when kind=PERCENT. 0–100 integer. */
  pct?: number;
  /** Required when kind=FIXED_AMOUNT. Integer VND >= 0. */
  amountVnd?: number;
  /** Required when kind=VOUCHER. Stored case-insensitively. */
  voucherCode?: string;
  /** Total redemption quota. null = unlimited. */
  quotaTotal?: number;
  /** ISO date string "YYYY-MM-DD". null = open-ended. */
  validFrom?: string;
  validUntil?: string;
  /** Array of branchIds this program applies to. null = all branches. */
  branchScope?: string[];
}

export interface UpdateDiscountProgramDto {
  name?: string;
  validFrom?: string | null;
  validUntil?: string | null;
  branchScope?: string[] | null;
}

export interface DiscountProgramListQuery {
  branchId?: string;
  kind?: DiscountKindDto;
  activeOnly?: boolean;
}

export interface CreateDiscountReasonDto {
  name: string;
}

/**
 * Redeem a voucher at the POS (VG-03.4).
 * Returns the program if valid and quota available; decrements quota with row lock.
 */
export interface RedeemVoucherDto {
  voucherCode: string;
  branchId: string;
}

/**
 * Verify a QUAN_LY_CN approval PIN for manual discounts over threshold (VG-03.3).
 * 3 wrong attempts → cancel + audit log.
 */
export interface VerifyApprovalPinDto {
  /** The QUAN_LY_CN user whose PIN is being checked. */
  managerId: string;
  /** The 6-digit PIN entered at the POS. */
  pin: string;
  /** Optional: bill or action context for audit trail. */
  reason?: string;
  branchId?: string;
}

export interface VerifyApprovalPinResult {
  approved: boolean;
  /** Set when approved=true. */
  approvedBy?: string;
  /** Set when approved=false and lock happened. */
  locked?: boolean;
}
