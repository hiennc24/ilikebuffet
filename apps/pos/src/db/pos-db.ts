/**
 * POS IndexedDB store — Dexie scaffold (H8 / BH-02.7).
 *
 * Tables:
 *   draft_bills  — unpaid in-progress orders (distinct from completed-bill
 *                  outbox). Owner: P7. P5 only provisions the store.
 *   [future]     — completed_bill_outbox (P8 offline sync). NOT created here
 *                  to avoid schema entanglement before P8 is spec'd.
 *
 * Schema versioning rule: every breaking change increments the version and
 * provides an upgrade() callback. Never mutate an existing schema entry.
 *
 * Sync logic is intentionally absent — P8 owns that boundary.
 */

import Dexie, { type Table } from "dexie";

// ── Draft bill types (BH-02.7) ─────────────────────────────────────────────

export interface DraftBillItem {
  menuItemId: string;
  name: string;
  quantity: number;
  /** Unit price in integer VND đồng. */
  unitPrice: number;
}

/**
 * DraftBill — an unpaid, in-progress order that persists across page reloads.
 *
 * Distinct from the completed-bill outbox (P8): a draft has no paymentMethod,
 * no completedAt, and may be abandoned. P7 will add create/update/delete ops.
 */
export interface DraftBill {
  /** Auto-incremented local key. */
  id?: number;
  /** Which table/seat the order belongs to (nullable for counter orders). */
  tableId: string | null;
  branchId: string;
  /** ISO-8601 timestamp when the draft was created (for display / stale cleanup). */
  createdAt: string;
  /** ISO-8601 timestamp of last modification. */
  updatedAt: string;
  items: DraftBillItem[];
  /** Optional free-text note for the kitchen. */
  note?: string;
}

// ── DB class ───────────────────────────────────────────────────────────────

export class PosDb extends Dexie {
  draft_bills!: Table<DraftBill, number>;

  constructor() {
    super("ilikebuffet_pos");

    /**
     * Version 1 — initial schema.
     * Index on branchId so P7 can list drafts for the current branch.
     * Index on tableId for table-based lookup.
     * Index on updatedAt for stale-draft cleanup (future).
     */
    this.version(1).stores({
      draft_bills: "++id, branchId, tableId, updatedAt",
    });
  }
}

/** Singleton instance — import this, don't construct PosDb elsewhere. */
export const posDb = new PosDb();
