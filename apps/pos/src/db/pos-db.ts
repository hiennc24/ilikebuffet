/**
 * POS IndexedDB store — Dexie schema.
 *
 * Tables:
 *   draft_bills       — unpaid in-progress orders.
 *   offline_outbox    — completed bills waiting for sync.
 *
 * Schema versioning rule: every breaking change increments the version and
 * provides an upgrade() callback. Never mutate an existing schema entry.
 */

import Dexie, { type Table } from "dexie";
import type { PriceBookSnapshot } from "@ilikebuffet/shared";

// ── Draft bill types ────────────────────────────────────────────────────────

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
 * Distinct from the completed-bill outbox: a draft has no paymentMethod,
 * no completedAt, and may be abandoned.
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

// ── Offline outbox types ────────────────────────────────────────────────────

export type OutboxStatus = "pending" | "syncing" | "committed" | "retry";

export interface OutboxLine {
  ticketTypeId: string;
  qty: number;
}

/**
 * OutboxBill — a completed offline bill awaiting sync.
 *
 * Append-only: bills are never mutated after creation.
 * Deleted only after receiving an officialNumber from the server.
 */
export interface OutboxBill {
  /** Auto-incremented local key. */
  id?: number;
  /** Stable UUID generated at creation (CSPRNG). Dedup key on server. */
  clientUuid: string;
  /** Device-issued temp number "[CN]-[YYMMDD]-T[SHORT][NNN]". */
  tempNumber: string;
  branchId: string;
  shiftId: string;
  deviceId: string;
  /** ISO-8601 bill creation time (price deciding timestamp). */
  createdAt: string;
  /** Device wall-clock at creation + skew vs server (for clock-skew detection). Non-indexed. */
  deviceClockAt?: string;
  clockOffsetMs?: number;
  lines: OutboxLine[];
  /** Payment(s) taken offline for this bill. Synced with the bill. */
  payments?: Array<{
    method: "CASH" | "VIETQR" | "CARD";
    amountVnd: number;
    reference?: string;
    /** Cash tendered by customer (CASH only). Must be >= amountVnd. Server
     *  computes changeVnd = tenderedVnd - amountVnd; we do not send changeVnd. */
    tenderedVnd?: number;
  }>;
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

// ── Catalog cache (cold-boot offline pricing) ──────────────────────────────

export interface CachedTicketType {
  id: string;
  name: string;
  color?: string;
  displayOrder: number;
  isFree: boolean;
}

/**
 * One cached catalog per branch. Lets the device price bills offline with
 * the SAME shared resolver the server uses (offline-pricing parity), even when
 * it boots offline. Refreshed on every successful online load.
 */
export interface CatalogCache {
  /** Primary key. */
  branchId: string;
  branchCode: string;
  /** Price-book snapshot from GET /sales/pricing/versions/snapshot, priced
   *  offline with the shared resolver (same shape the server uses). */
  snapshot: PriceBookSnapshot;
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
     * Index on branchId for listing drafts for the current branch.
     * Index on tableId for table-based lookup.
     * Index on updatedAt for stale-draft cleanup (future).
     */
    this.version(1).stores({
      draft_bills: "++id, branchId, tableId, updatedAt",
    });

    /**
     * Version 2 — offline outbox for completed bills pending sync.
     * Index on status for pending-batch queries.
     * Index on branchId for branch-scoped queries.
     * Index on clientUuid for idempotency lookups.
     */
    this.version(2).stores({
      draft_bills: "++id, branchId, tableId, updatedAt",
      offline_outbox: "++id, &clientUuid, branchId, status, createdAt",
    });

    /**
     * Version 3 — per-branch catalog cache for cold-boot offline pricing.
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
