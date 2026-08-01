/**
 * outbox-store — Dexie CRUD helpers for the offline bill outbox (P8 / BH-05).
 *
 * Rules (C5):
 *   - Bills are never deleted until an officialNumber is received from server.
 *   - Status transitions: pending → syncing → committed | retry.
 *   - A committed bill is retained for display ("bill number is X") then cleared.
 *
 * Temp number format: "[BRANCH_CODE]-[YYMMDD]-T[DEVICE_SHORT][NNN]"
 *   DEVICE_SHORT = first 4 chars of deviceId (uppercase).
 *   NNN = branch-scoped per-device sequence, wrapped per calendar day.
 */

import { posDb } from "../db/pos-db";
import type { OutboxBill } from "../db/pos-db";

const TEMP_SEQ_KEY_PREFIX = "ibb_pos_temp_seq_";

function tempSeqKey(deviceId: string, branchId: string, dateStr: string): string {
  return `${TEMP_SEQ_KEY_PREFIX}${deviceId}_${branchId}_${dateStr}`;
}

/** Increment and return the per-day temp sequence for this device+branch. */
function nextTempSeq(deviceId: string, branchId: string, dateStr: string): number {
  const key = tempSeqKey(deviceId, branchId, dateStr);
  const current = parseInt(localStorage.getItem(key) ?? "0", 10);
  const next = current + 1;
  localStorage.setItem(key, String(next));
  return next;
}

/** Reset the temp sequence (e.g. at end-of-day or test teardown). */
export function resetTempSeq(deviceId: string, branchId: string, dateStr: string): void {
  localStorage.removeItem(tempSeqKey(deviceId, branchId, dateStr));
}

/**
 * Build the device-issued temp number.
 * Format: "[BRANCH_CODE]-[YYMMDD]-T[DEVICE_SHORT][NNN]"
 * DEVICE_SHORT = uppercase first 4 non-hyphen chars of deviceId.
 * NNN = 3-digit zero-padded daily sequence.
 */
export function buildTempNumber(
  branchCode: string,
  deviceId: string,
  branchId: string,
  createdAt: Date,
): string {
  // YYMMDD in Asia/Ho_Chi_Minh (approximate via toLocaleDateString fallback)
  const vn = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(createdAt);
  // en-CA gives "YYYY-MM-DD"
  const [year, month, day] = vn.split("-");
  const dateStr = `${year}-${month}-${day}`;
  const datePart = `${year!.slice(2)}${month}${day}`;

  const deviceShort = deviceId.replace(/-/g, "").slice(0, 4).toUpperCase();
  const seq = nextTempSeq(deviceId, branchId, dateStr);
  return `${branchCode}-${datePart}-T${deviceShort}${String(seq).padStart(3, "0")}`;
}

/** Add a new bill to the outbox. Returns the local Dexie id. */
export async function addToOutbox(
  bill: Omit<OutboxBill, "id" | "status" | "attempts">,
): Promise<number> {
  return posDb.offline_outbox.add({
    ...bill,
    status: "pending",
    attempts: 0,
  });
}

/** Return all bills with status "pending" or "retry" (to be submitted in next sync). */
export async function getPendingBills(branchId: string): Promise<OutboxBill[]> {
  return posDb.offline_outbox
    .where("branchId")
    .equals(branchId)
    .filter((b) => b.status === "pending" || b.status === "retry")
    .toArray();
}

/** Mark bills as "syncing" before submitting the batch. */
export async function markSyncing(ids: number[]): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      posDb.offline_outbox.update(id, {
        status: "syncing",
        lastAttemptAt: new Date().toISOString(),
      }),
    ),
  );
}

/** Mark a bill as committed with its official number. */
export async function markCommitted(clientUuid: string, officialNumber: string): Promise<void> {
  const bill = await posDb.offline_outbox.where("clientUuid").equals(clientUuid).first();
  if (bill?.id !== undefined) {
    await posDb.offline_outbox.update(bill.id, {
      status: "committed",
      officialNumber,
    });
  }
}

/** Mark a bill as retry after a failed sync attempt. */
export async function markRetry(clientUuid: string, error: string): Promise<void> {
  const bill = await posDb.offline_outbox.where("clientUuid").equals(clientUuid).first();
  if (bill?.id !== undefined) {
    await posDb.offline_outbox.update(bill.id, {
      status: "retry",
      attempts: (bill.attempts ?? 0) + 1,
      lastError: error,
    });
  }
}

/** Delete committed bills (after they've been shown to the cashier). */
export async function clearCommitted(branchId: string): Promise<void> {
  const committed = await posDb.offline_outbox
    .where("branchId")
    .equals(branchId)
    .filter((b) => b.status === "committed")
    .toArray();
  const ids = committed.map((b) => b.id).filter((id): id is number => id !== undefined);
  if (ids.length > 0) {
    await posDb.offline_outbox.bulkDelete(ids);
  }
}

/** Get a specific bill by clientUuid. */
export async function getByClientUuid(clientUuid: string): Promise<OutboxBill | undefined> {
  return posDb.offline_outbox.where("clientUuid").equals(clientUuid).first();
}

/** Count pending+retry bills (for the offline banner). */
export async function countPending(branchId: string): Promise<number> {
  return posDb.offline_outbox
    .where("branchId")
    .equals(branchId)
    .filter((b) => b.status === "pending" || b.status === "retry" || b.status === "syncing")
    .count();
}
