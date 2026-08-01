/**
 * Pure, deterministic price resolver for ILikeBuffet.
 *
 * Runs IDENTICALLY on server and offline client — no NestJS/DB
 * imports. Input is a pre-fetched snapshot; output is integer VND or a typed
 * result object.
 *
 * Design decisions:
 *
 *   #3 — The deciding timestamp (createdAt vs paidAt) is controlled by
 *   PRICE_TIMESTAMP_FIELD (default: "createdAt"). Reversing = 1 constant change.
 *   Tests lock the CONTRACT ("one timestamp decides price"), not the specific value.
 *
 *   #2 — Out-of-hours behaviour controlled by OUT_OF_HOURS_POLICY. Default:
 *   return { kind: "NO_PRICE", reason: "OUT_OF_HOURS" }. Build-default;
 *   awaiting client signature.
 *
 *   #4 — Free-ticket-only-bill policy is a separate policy object
 *   (FREE_TICKET_POLICY). The resolver itself does NOT enforce it — that is the
 *   bill layer's responsibility. This keeps the resolver single-purpose.
 *
 * Day-type priority: HOLIDAY > WEEKEND > REGULAR.
 * Branch fallback: branch cell → chain cell.
 * Version: pick highest version with effectiveFrom <= decidingDate.
 *
 * All money is integer VND. No floats.
 */

import { assertVndInteger } from "../money";

// ─── Day-type enum ────────────────────────────────────────────────────────────

export type DayType = "HOLIDAY" | "WEEKEND" | "REGULAR";

// ─── Snapshot data structures (P8-portable, no Prisma types) ─────────────────

/** One price cell inside a snapshot. */
export interface PriceCellSnapshot {
  ticketTypeId: string;
  timeWindowId: string;
  dayType: DayType;
  priceVnd: number;
  /** null = chain-wide cell; set = branch-specific override. */
  branchId: string | null;
}

/** One time-window definition. Minutes are in 0..1439 range. */
export interface TimeWindowSnapshot {
  id: string;
  name: string;
  startMinute: number; // inclusive
  endMinute: number;   // exclusive (endMinute > startMinute)
}

/** One price book version. */
export interface PriceBookVersionSnapshot {
  id: string;
  /**
   * ISO date string "YYYY-MM-DD" — the calendar date (VN timezone) from
   * which this version is effective. Comparison is done as string (ISO sort).
   */
  effectiveDateStr: string;
  /** null = chain-wide; set = branch-specific. */
  branchId: string | null;
  cells: PriceCellSnapshot[];
}

/**
 * Full snapshot passed to resolvePrice().
 *
 * The server loads this from DB and caches it for offline use. The snapshot
 * carries a versionStamp (wall-clock ms) so clients can detect stale caches
 * (see detectCacheStaleness).
 */
export interface PriceBookSnapshot {
  /**
   * Wall-clock ms when this snapshot was generated (server side).
   * Used by detectCacheStaleness() to flag offline bills created against an
   * older snapshot when a newer version has been published.
   */
  snapshotGeneratedAt: number;
  timeWindows: TimeWindowSnapshot[];
  versions: PriceBookVersionSnapshot[];
}

// ─── Config constants (build-defaults) ────────────────────────────────────────

/**
 * Which timestamp field decides the price.
 * Default = "createdAt" (confirmed decision).
 * To use paidAt: change this constant — no other code changes needed.
 * Build-default; awaiting client signature before golive.
 */
export const PRICE_TIMESTAMP_FIELD: "createdAt" | "paidAt" = "createdAt";

/**
 * Out-of-hours policy (build-default #2; awaiting client signature).
 * "BLOCK" = no price / bill cannot be created.
 * "ALLOW_NO_WINDOW" = a future policy that could allow a default price outside windows.
 */
export const OUT_OF_HOURS_POLICY = "BLOCK" as const;

/**
 * Free-ticket-must-have-paid-companion policy (build-default #4 / V4).
 * Exported so bill layer can import and check, keeping resolver single-purpose.
 * "REQUIRE_PAID_COMPANION" = bill must contain ≥1 ticket with price > 0.
 * Build-default; awaiting client signature before golive.
 */
export interface FreeTicketPolicy {
  /** "REQUIRE_PAID_COMPANION": a free-ticket cannot stand alone. Build-default. */
  kind: "REQUIRE_PAID_COMPANION" | "ALLOW_STANDALONE";
}
export const FREE_TICKET_POLICY: FreeTicketPolicy = {
  // build-default, awaiting client signature (V4)
  kind: "REQUIRE_PAID_COMPANION",
};

// ─── Resolver input / output ──────────────────────────────────────────────────

/** Timestamps for the bill. The resolver picks one based on PRICE_TIMESTAMP_FIELD. */
export interface BillTimestamps {
  createdAt: Date;
  paidAt?: Date;
}

/** Successful price resolution result. */
export interface PriceResolved {
  kind: "PRICE";
  priceVnd: number;
  /** The ISO date string used to look up the effective version. */
  decidingDateStr: string;
  /** Which timestamp was used (contract: one field, config-driven). */
  decidingTimestampField: "createdAt" | "paidAt";
  /** The version id that was applied. */
  versionId: string;
  /** Whether the price came from a branch-specific cell (true) or chain (false). */
  fromBranchOverride: boolean;
  timeWindowId: string;
  dayType: DayType;
}

/** No price found — out-of-hours or missing price book. */
export interface PriceNoPrice {
  kind: "NO_PRICE";
  reason: "OUT_OF_HOURS" | "NO_VERSION" | "NO_CELL";
}

export type PriceResult = PriceResolved | PriceNoPrice;

// ─── Date/time helpers (pure, no I/O) ────────────────────────────────────────

/**
 * Convert a Date to "YYYY-MM-DD" in Asia/Ho_Chi_Minh timezone.
 * Used by the resolver to match the VN calendar date stored in effectiveDateStr.
 */
export function toVnDateStr(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Return minutes since midnight (0–1439) in Asia/Ho_Chi_Minh timezone.
 */
export function toVnMinuteOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return hour * 60 + minute;
}

/**
 * Return the day-of-week index (0=Sun..6=Sat) in Asia/Ho_Chi_Minh timezone.
 */
export function toVnDayOfWeek(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
  }).formatToParts(date);
  const wd = parts.find((p) => p.type === "weekday")?.value;
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[wd ?? "Mon"] ?? 1;
}

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolve the unit price for one ticket in one bill.
 *
 * Pure function — given the same inputs, always returns the same output.
 * No side effects, no I/O, no Prisma, no NestJS.
 *
 * @param branchId      The branch where the bill is being created.
 * @param ticketTypeId  The ticket type being priced.
 * @param isFree        True when the ticket type has isFree=true (price always 0).
 * @param timestamps    createdAt + optional paidAt. Deciding field set by PRICE_TIMESTAMP_FIELD.
 * @param isHolidayFn   Pure function: (dateStr) => boolean. Caller injects holiday logic.
 * @param isWeekendFn   Pure function: (date) => boolean. Caller injects weekend logic.
 * @param snapshot      Full price-book snapshot loaded from DB / cache.
 */
export function resolvePrice(
  branchId: string,
  ticketTypeId: string,
  isFree: boolean,
  timestamps: BillTimestamps,
  isHolidayFn: (dateStr: string) => boolean,
  isWeekendFn: (date: Date) => boolean,
  snapshot: PriceBookSnapshot,
): PriceResult {
  // Free ticket: price is always 0 regardless of any other logic.
  if (isFree) {
    // We still need a valid time-window to confirm we're within operating hours.
    // But the price itself is always 0.
    const decidingTs = pickDecidingTimestamp(timestamps);
    const dateStr = toVnDateStr(decidingTs);
    const minuteOfDay = toVnMinuteOfDay(decidingTs);
    const tw = findTimeWindow(snapshot.timeWindows, minuteOfDay);
    if (!tw && OUT_OF_HOURS_POLICY === "BLOCK") {
      return { kind: "NO_PRICE", reason: "OUT_OF_HOURS" };
    }
    return {
      kind: "PRICE",
      priceVnd: 0,
      decidingDateStr: dateStr,
      decidingTimestampField: PRICE_TIMESTAMP_FIELD,
      versionId: "",
      fromBranchOverride: false,
      timeWindowId: tw?.id ?? "",
      dayType: resolveDayType(decidingTs, dateStr, isHolidayFn, isWeekendFn),
    };
  }

  // Pick the deciding timestamp (C9 — config constant).
  const decidingTs = pickDecidingTimestamp(timestamps);
  const dateStr = toVnDateStr(decidingTs);
  const minuteOfDay = toVnMinuteOfDay(decidingTs);

  // 1. Find time window.
  const tw = findTimeWindow(snapshot.timeWindows, minuteOfDay);
  if (!tw) {
    return { kind: "NO_PRICE", reason: "OUT_OF_HOURS" };
  }

  // 2. Find the effective version for this branch and date.
  const version = findEffectiveVersion(snapshot.versions, branchId, dateStr);
  if (!version) {
    return { kind: "NO_PRICE", reason: "NO_VERSION" };
  }

  // 3. Resolve day-type.
  const dayType = resolveDayType(decidingTs, dateStr, isHolidayFn, isWeekendFn);

  // 4. Look up price cell: branch-specific → chain fallback.
  const cellResult = findPriceCell(version.cells, ticketTypeId, tw.id, dayType, branchId);
  if (!cellResult) {
    return { kind: "NO_PRICE", reason: "NO_CELL" };
  }

  assertVndInteger(cellResult.cell.priceVnd);

  return {
    kind: "PRICE",
    priceVnd: cellResult.cell.priceVnd,
    decidingDateStr: dateStr,
    decidingTimestampField: PRICE_TIMESTAMP_FIELD,
    versionId: version.id,
    fromBranchOverride: cellResult.fromBranchOverride,
    timeWindowId: tw.id,
    dayType,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Select the deciding timestamp based on PRICE_TIMESTAMP_FIELD config. */
function pickDecidingTimestamp(timestamps: BillTimestamps): Date {
  if (PRICE_TIMESTAMP_FIELD === "paidAt") {
    if (!timestamps.paidAt) {
      // paidAt not yet set (bill not paid) — fall back to createdAt.
      return timestamps.createdAt;
    }
    return timestamps.paidAt;
  }
  return timestamps.createdAt; // default
}

/** Find the time window covering minuteOfDay. Returns undefined if none. */
function findTimeWindow(
  windows: TimeWindowSnapshot[],
  minuteOfDay: number,
): TimeWindowSnapshot | undefined {
  return windows.find(
    (w) => minuteOfDay >= w.startMinute && minuteOfDay < w.endMinute,
  );
}

/**
 * Find the effective price-book version for (branchId, dateStr).
 *
 * Priority: branch-specific version > chain-wide version.
 * Within each scope: pick the version with the highest effectiveDateStr
 * that is <= decidingDateStr (auto-applies at 0h of effective date).
 */
function findEffectiveVersion(
  versions: PriceBookVersionSnapshot[],
  branchId: string,
  dateStr: string,
): PriceBookVersionSnapshot | undefined {
  // Candidates: effectiveFrom <= decidingDate (string comparison is correct for ISO dates).
  const candidates = versions.filter((v) => v.effectiveDateStr <= dateStr);

  // Sort: newest effectiveDateStr first; tie-break by id descending (later-created wins).
  const versionSort = (a: PriceBookVersionSnapshot, b: PriceBookVersionSnapshot): number => {
    const dateCmp = b.effectiveDateStr.localeCompare(a.effectiveDateStr);
    if (dateCmp !== 0) return dateCmp;
    return b.id.localeCompare(a.id);
  };

  // Prefer branch-specific version.
  const branchVersions = candidates
    .filter((v) => v.branchId === branchId)
    .sort(versionSort);
  if (branchVersions.length > 0) return branchVersions[0];

  // Fall back to chain-wide version.
  const chainVersions = candidates
    .filter((v) => v.branchId === null)
    .sort(versionSort);
  return chainVersions[0];
}

/**
 * Resolve day-type with priority HOLIDAY > WEEKEND > REGULAR.
 * isHolidayFn and isWeekendFn are injected so the resolver stays pure.
 */
function resolveDayType(
  date: Date,
  dateStr: string,
  isHolidayFn: (dateStr: string) => boolean,
  isWeekendFn: (date: Date) => boolean,
): DayType {
  if (isHolidayFn(dateStr)) return "HOLIDAY";
  if (isWeekendFn(date)) return "WEEKEND";
  return "REGULAR";
}

/**
 * Find price cell in priority order: branch override > chain cell.
 * Within a scope we take the FIRST match (only one cell per combination by DB unique constraint).
 */
function findPriceCell(
  cells: PriceCellSnapshot[],
  ticketTypeId: string,
  timeWindowId: string,
  dayType: DayType,
  branchId: string,
): { cell: PriceCellSnapshot; fromBranchOverride: boolean } | undefined {
  // Branch-specific cell takes priority over chain-wide cell.
  const branchCell = cells.find(
    (c) =>
      c.ticketTypeId === ticketTypeId &&
      c.timeWindowId === timeWindowId &&
      c.dayType === dayType &&
      c.branchId === branchId,
  );
  if (branchCell) return { cell: branchCell, fromBranchOverride: true };

  // Chain-wide cell (fallback).
  const chainCell = cells.find(
    (c) =>
      c.ticketTypeId === ticketTypeId &&
      c.timeWindowId === timeWindowId &&
      c.dayType === dayType &&
      c.branchId === null,
  );
  if (chainCell) return { cell: chainCell, fromBranchOverride: false };

  return undefined;
}

// ─── Cache staleness detection (C2/AD3 hydration-parity hook) ────────────────

/**
 * Compare a client cache snapshot against the server's current snapshot.
 *
 * Returns true if the client cache is OLDER than the server snapshot — meaning
 * bills created while offline against the stale cache may have incorrect prices.
 * The caller (P7/P8 reconnect flow) MUST flag those bills for server recompute.
 *
 * This is the hydration-parity hook: the server recomputes at reconciliation,
 * not here. This function only DETECTS the mismatch condition.
 */
export function detectCacheStaleness(
  clientSnapshotGeneratedAt: number,
  serverSnapshotGeneratedAt: number,
): boolean {
  return clientSnapshotGeneratedAt < serverSnapshotGeneratedAt;
}

/**
 * Check if any offline-created bill used a cache version that is now superseded.
 *
 * A bill's snapshot stamp is stored when the bill is created offline.
 * On reconnect, compare against server's current stamp.
 *
 * @param billSnapshotGeneratedAt  The snapshotGeneratedAt stamp at bill creation time.
 * @param serverSnapshotGeneratedAt The server's current snapshot stamp.
 * @returns true = prices on this bill may have been resolved against a stale
 *          version and MUST be recomputed server-side before finalising.
 */
export function billRequiresPriceRecheck(
  billSnapshotGeneratedAt: number,
  serverSnapshotGeneratedAt: number,
): boolean {
  return detectCacheStaleness(billSnapshotGeneratedAt, serverSnapshotGeneratedAt);
}
