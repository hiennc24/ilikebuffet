/**
 * DTOs for pricing CRUD: time-windows, price-book versions, price cells (VG-02).
 */

// ─── Time Window ──────────────────────────────────────────────────────────────

export interface CreateTimeWindowDto {
  name: string;
  /** Minutes since midnight, inclusive (0–1439). */
  startMinute: number;
  /** Minutes since midnight, exclusive (1–1440, must be > startMinute). */
  endMinute: number;
  displayOrder?: number;
}

export interface UpdateTimeWindowDto {
  name?: string;
  startMinute?: number;
  endMinute?: number;
  displayOrder?: number;
}

// ─── Price Book Version ───────────────────────────────────────────────────────

export interface CreatePriceBookVersionDto {
  name: string;
  /**
   * ISO date string "YYYY-MM-DD" — the calendar date from which this version
   * is effective (VN timezone midnight). Auto-applies at 0h of this date (VG-02.6).
   */
  effectiveFrom: string;
  /** null = chain-wide; set = branch-specific (VG-02.4). */
  branchId?: string | null;
  /**
   * If set, clone all cells from this version as the starting point.
   * Used by the "create-new-version from old" flow (VG-02.3 — cannot edit live version).
   */
  cloneFromVersionId?: string;
}

export interface PriceBookVersionListQuery {
  branchId?: string | null;
}

// ─── Price Cell ───────────────────────────────────────────────────────────────

export type DayTypeDto = "REGULAR" | "WEEKEND" | "HOLIDAY";

export interface UpsertPriceCellDto {
  ticketTypeId: string;
  timeWindowId: string;
  dayType: DayTypeDto;
  /** Integer VND. Must be >= 0. */
  priceVnd: number;
  /** null = chain-wide cell; set = branch override (VG-02.4). */
  branchId?: string | null;
}

// ─── Branch price flag ────────────────────────────────────────────────────────

export interface SetBranchPriceFlagDto {
  branchId: string;
  allowOwnPrice: boolean;
}

// ─── Resolve price (server-side, for bill creation) ──────────────────────────

export interface ResolvePriceDto {
  branchId: string;
  ticketTypeId: string;
  /** ISO timestamp for the deciding timestamp (createdAt of the bill). */
  createdAt: string;
  /** ISO timestamp for paidAt — optional, for config-switch scenarios. */
  paidAt?: string;
}
