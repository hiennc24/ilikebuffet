/**
 * draft-bill-store — Dexie CRUD helpers for the single counter draft per branch.
 *
 * One active counter draft (tableId=null) per branch. clientUuid is stored in
 * localStorage keyed by branch so it survives refresh and is cleared on pay.
 *
 * All callers import from this module; they never touch posDb.draft_bills directly.
 */

import { posDb } from "./pos-db";
import type { DraftBillItem } from "./pos-db";

const CLIENT_UUID_PREFIX = "ibb_pos_draft_uuid_";

function clientUuidKey(branchId: string): string {
  return `${CLIENT_UUID_PREFIX}${branchId}`;
}

/** Return the idempotency UUID for this branch's active draft. Creates one if absent. */
export function getOrCreateClientUuid(branchId: string): string {
  const key = clientUuidKey(branchId);
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

/** Clear the clientUuid after a successful payment. */
export function clearClientUuid(branchId: string): void {
  localStorage.removeItem(clientUuidKey(branchId));
}

/** Return the single counter draft for this branch, or undefined if none. */
export async function getActiveDraft(branchId: string) {
  return posDb.draft_bills
    .where("branchId")
    .equals(branchId)
    .filter((d) => d.tableId === null)
    .first();
}

/**
 * Upsert the counter draft for this branch.
 * If a draft exists, update items + updatedAt. If not, insert a new one.
 * No-op if items is empty and no draft exists (avoid orphan empty records).
 */
export async function saveDraft(branchId: string, items: DraftBillItem[]): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getActiveDraft(branchId);
  if (existing?.id !== undefined) {
    await posDb.draft_bills.update(existing.id, { items, updatedAt: now });
  } else {
    if (items.length === 0) return;
    await posDb.draft_bills.add({
      tableId: null,
      branchId,
      createdAt: now,
      updatedAt: now,
      items,
    });
  }
}

/** Remove the counter draft for this branch. Called after successful payment. */
export async function clearDraft(branchId: string): Promise<void> {
  const existing = await getActiveDraft(branchId);
  if (existing?.id !== undefined) {
    await posDb.draft_bills.delete(existing.id);
  }
}
