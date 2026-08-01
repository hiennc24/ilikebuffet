/**
 * POS IndexedDB store — Dexie schema.
 *
 * Tables:
 *   draft_bills       — unpaid in-progress orders (H8 / BH-02.7). Owner: P7.
 *   offline_outbox    — completed bills waiting for sync (P8 / BH-05).
 *
 * Schema versioning rule: every breaking change increments the version and
 * provides an upgrade() callback. Never mutate an existing schema entry.
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

// ── Offline outbox types (BH-05 / P8) ──────────────────────────────────────

export type OutboxStatus = "pending" | "syncing" | "committed" | "retry";

export interface OutboxLine {
  ticketTypeId: string;
  qty: number;
}

/**
 * OutboxBill — a completed offline bill awaiting sync.
 *
 * Append-only: bills are never mutated after creation.
 * Deleted only after receiving an officialNumber from the server (C5).
 */
export interface OutboxBill {
  /** Auto-incremented local key. */
  id?: number;
  /** Stable UUID generated at creation (CSPRNG). Dedup key on server. */
  clientUuid: string;
  /** Device-issued temp number "[CN]-[YYMMDD]-T[SHORT][NNN]" (C8). */
  tempNumber: string;
  branchId: string;
  shiftId: string;
  deviceId: string;
  /** ISO-8601 bill creation time (price deciding timestamp, V1). */
  createdAt: string;
  /** Device wall-clock at creation + skew vs server (H5). Non-indexed. */
  deviceClockAt?: string;
  clockOffsetMs?: number;
  lines: OutboxLine[];
  status: OutboxStatus;
  /** Official gapless number assigned after successful sync. */
  officialNumber?: string;
  /** ISO-8601 last sync attempt time. */
  lastAttemptAt?: string;
  /** Number of sync attempts (for backoff). */
  attempts: number;
  /** Server error from last retry. */
  lastError?: string;
}

// ── DB class ───────────────────────────────────────────────────────────────

// ── Catalog cache (P8: cold-boot offline pricing) ──────────────────────────

export interface CachedTicketType {
  id: string;
  name: string;
  color?: string;
  displayOrder: number;
  isFree: boolean;
}

/**
 * One cached catalog per branch (P8). Lets the device price bills offline with
 * the SAME shared resolver the server uses (offline-pricing parity), even when
 * it boots offline. Refreshed on every successful online load.
 */
export interface CatalogCache {
  /** Primary key. */
  branchId: string;
  branchCode: string;
  /** PriceBookSnapshot from GET /sales/pricing/versions/snapshot (typed loosely
   *  to avoid a hard schema coupling in the Dexie layer). */
  snapshot: unknown;
  ticketTypes: CachedTicketType[];
  /** ISO-8601 when this catalog was cached. */
  cachedAt: string;
}

export class PosDb extends Dexie {
  draft_bills!: Table<DraftBill, number>;
  offline_outbox!: Table<OutboxBill, number>;
  catalog_cache!: Table<CatalogCache, string>;

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

    /**
     * Version 2 — P8: offline outbox for completed bills pending sync.
     * Index on status for pending-batch queries.
     * Index on branchId for branch-scoped queries.
     * Index on clientUuid for idempotency lookups.
     */
    this.version(2).stores({
      draft_bills: "++id, branchId, tableId, updatedAt",
      offline_outbox: "++id, &clientUuid, branchId, status, createdAt",
    });

    /**
     * Version 3 — P8: per-branch catalog cache for cold-boot offline pricing.
     * Primary key = branchId (one cached catalog per branch).
     */
    this.version(3).stores({
      draft_bills: "++id, branchId, tableId, updatedAt",
      offline_outbox: "++id, &clientUuid, branchId, status, createdAt",
      catalog_cache: "branchId",
    });
  }
}

/** Singleton instance — import this, don't construct PosDb elsewhere. */
export const posDb = new PosDb();
