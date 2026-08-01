/**
 * DTOs for shift lifecycle operations.
 */

export interface OpenShiftDto {
  branchId: string;
  deviceId: string;
  /** Integer VND — opening cash in the drawer. */
  openingCashVnd: number;
}

export interface CloseShiftDto {
  /** Integer VND — cash counted at close. */
  countedCashVnd: number;
  /** Required when countedCashVnd !== expectedCashVnd. */
  varianceNote?: string;
  /** Highest device-issued temp sequence this shift (for audit high-water-mark). */
  tempHighWater?: number;
}

export interface ForceCloseShiftDto {
  /** The QUAN_LY_CN user authorising the force-close. */
  managerId: string;
  /** The manager's 6-digit approval PIN. */
  pin: string;
  /** Optional reason for the force-close (written to audit trail). */
  reason?: string;
}

export interface ShiftListQuery {
  branchId?: string;
  status?: "OPEN" | "CLOSED" | "FORCE_CLOSED";
}
