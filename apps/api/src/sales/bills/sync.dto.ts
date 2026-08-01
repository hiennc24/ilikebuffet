/**
 * DTOs for the offline bill sync endpoint (P8 / BH-05).
 *
 * Client submits a batch of offline bills; server returns a full map of
 * {clientUuid → result} for every bill in the request (C5: never partial).
 * Client lines contain NO prices — server recomputes all prices (C2).
 */

export interface SyncBillLineDto {
  ticketTypeId: string;
  qty: number;
}

/** A payment taken offline, synced with the bill (BH-03/BH-05). */
export interface SyncPaymentDto {
  method: "CASH" | "VIETQR" | "CARD";
  amountVnd: number;
  reference?: string;
}

export interface SyncBillDto {
  /** Stable UUID generated on-device at bill-creation time (CSPRNG). */
  clientUuid: string;
  /** Device-issued temp number "[CN]-[YYMMDD]-T[DEVICE_SHORT][NNN]" for audit. */
  tempNumber: string;
  branchId: string;
  shiftId: string;
  deviceId: string;
  /** ISO-8601: price deciding timestamp (server re-resolves at this instant, V1). */
  createdAt: string;
  /** Device wall-clock at creation (ISO-8601) — for skew audit (H5). */
  deviceClockAt?: string;
  /** Device→server clock offset (ms) recorded at last online sync (H5). */
  clockOffsetMs?: number;
  lines: SyncBillLineDto[];
  /** Payments taken offline for this bill (BH-03). Recorded on sync. */
  payments?: SyncPaymentDto[];
}

/**
 * A draft that was assigned a temp number on-device but discarded before it
 * ever synced (C8). Syncing the void lets reconciliation tell an intentional
 * void from a suppressed/lost bill (a hole below the shift high-water-mark).
 */
export interface SyncVoidDto {
  tempNumber: string;
  branchId: string;
  deviceId: string;
  clientUuid?: string;
  reason?: string;
}

export interface SyncBatchDto {
  bills: SyncBillDto[];
  /** Voided-before-sync temp numbers to record (C8). */
  voids?: SyncVoidDto[];
}

/**
 * Force-close a stuck offline bill (H3): a bill the device printed but can never
 * sync normally. A manager PIN approves accepting it as a QUARANTINED sale so the
 * shift is not blocked forever and the paper bill is still accounted.
 */
export interface ForceCloseBillDto extends SyncBillDto {
  reason: string;
  /** QUAN_LY_CN user id whose approval PIN authorises the force-close. */
  managerId: string;
  pin: string;
}

// ─── Response types ───────────────────────────────────────────────────────────

export type SyncBillStatus = "committed" | "retry" | "rejected";

export interface SyncBillResult {
  clientUuid: string;
  status: SyncBillStatus;
  /** Official gapless number — set when status="committed". */
  officialNumber?: string;
  /** Temp number echoed back for client correlation. */
  tempNumber: string;
  /** Error detail when status="rejected" (content-hash mismatch, authz fail). */
  error?: string;
}

export interface SyncBatchResult {
  /** Full map: one entry per bill in request — never partial (C5). */
  results: SyncBillResult[];
  /** Count of void-before-sync events recorded (C8). */
  voidsRecorded?: number;
}
