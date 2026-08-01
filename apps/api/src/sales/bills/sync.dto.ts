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
  lines: SyncBillLineDto[];
}

export interface SyncBatchDto {
  bills: SyncBillDto[];
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
}
