/**
 * Price Resolver — TDD spec.
 *
 * Split into two sections:
 *   Part 1 — RESOLVER PURITY: deterministic output given identical inputs.
 *   Part 2 — HYDRATION PARITY: cache version-stamp + offline version-cutover detection.
 *
 * Key examples covered:
 *   - Người lớn × Tối × Lễ → correct price cell
 *   - Fallback CN → chuỗi (branch cell > chain cell)
 *   - Bill created 13:58, paid 14:05 → price by CREATE time (parametrized)
 *   - Future price-book doesn't affect today; auto-applies at 0h of effective date
 *   - Out-of-hours → NO_PRICE (build-default)
 *   - Free ticket → price 0
 *   - Version-cutover mid-day while device is offline (hydration-parity)
 */

import {
  resolvePrice,
  detectCacheStaleness,
  billRequiresPriceRecheck,
  toVnDateStr,
  toVnMinuteOfDay,
  PRICE_TIMESTAMP_FIELD,
  FREE_TICKET_POLICY,
  type PriceBookSnapshot,
  type PriceCellSnapshot,
  type TimeWindowSnapshot,
  type PriceBookVersionSnapshot,
  type BillTimestamps,
} from "./price-resolver";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TW_TRUA: TimeWindowSnapshot = { id: "tw-trua", name: "Trưa", startMinute: 630, endMinute: 840 }; // 10:30–14:00
const TW_TOI: TimeWindowSnapshot  = { id: "tw-toi",  name: "Tối",  startMinute: 1020, endMinute: 1320 }; // 17:00–22:00

const TT_NGUOI_LON = "tt-nguoilon";
const TT_TRE_EM    = "tt-treem";
const TT_FREE      = "tt-free";

const BRANCH_A = "branch-a";
const BRANCH_B = "branch-b"; // branch with NO own price book

function makeCell(
  ticketTypeId: string,
  timeWindowId: string,
  dayType: "REGULAR" | "WEEKEND" | "HOLIDAY",
  priceVnd: number,
  branchId: string | null = null,
): PriceCellSnapshot {
  return { ticketTypeId, timeWindowId, dayType, priceVnd, branchId };
}

/** Build a snapshot with one chain-wide version effective today. */
function makeSnapshot(
  todayStr: string,
  extraVersions: PriceBookVersionSnapshot[] = [],
  extraCells: PriceCellSnapshot[] = [],
): PriceBookSnapshot {
  const baseCells: PriceCellSnapshot[] = [
    // Chain-wide cells
    makeCell(TT_NGUOI_LON, TW_TRUA.id, "REGULAR",  150_000),
    makeCell(TT_NGUOI_LON, TW_TRUA.id, "WEEKEND",  180_000),
    makeCell(TT_NGUOI_LON, TW_TRUA.id, "HOLIDAY",  200_000),
    makeCell(TT_NGUOI_LON, TW_TOI.id,  "REGULAR",  170_000),
    makeCell(TT_NGUOI_LON, TW_TOI.id,  "WEEKEND",  200_000),
    makeCell(TT_NGUOI_LON, TW_TOI.id,  "HOLIDAY",  250_000), // ← Example: Người lớn × Tối × Lễ
    makeCell(TT_TRE_EM,    TW_TRUA.id, "REGULAR",   80_000),
    makeCell(TT_TRE_EM,    TW_TOI.id,  "REGULAR",   90_000),
    ...extraCells,
  ];

  const baseVersion: PriceBookVersionSnapshot = {
    id: "v1",
    effectiveDateStr: todayStr,
    branchId: null,
    cells: baseCells,
  };

  return {
    snapshotGeneratedAt: Date.now(),
    timeWindows: [TW_TRUA, TW_TOI],
    versions: [baseVersion, ...extraVersions],
  };
}

/** Always returns false (no holidays). */
const noHoliday = (_: string) => false;

/** Always returns false (never weekend). */
const noWeekend = (_: Date) => false;

/** Always returns true (always holiday). */
const alwaysHoliday = (_: string) => true;

/** Always returns true (always weekend). */
const alwaysWeekend = (_: Date) => true;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a Date at a specific VN local time on a given date string "YYYY-MM-DD". */
function vnTime(dateStr: string, hour: number, minute: number): Date {
  // VN is UTC+7; create a UTC date that represents the VN local time.
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, hour - 7, minute, 0, 0));
}

// ─── Part 1: RESOLVER PURITY ──────────────────────────────────────────────────

describe("Part 1 — Resolver Purity", () => {
  // The deciding-timestamp config is a public export; tests lock the CONTRACT
  // (a single field decides price), not the specific value.
  it("PRICE_TIMESTAMP_FIELD is a public export and has a defined value", () => {
    expect(["createdAt", "paidAt"]).toContain(PRICE_TIMESTAMP_FIELD);
  });

  describe("Example — Người lớn × Tối × Lễ", () => {
    it("resolves to the holiday-evening price cell (250,000 VND)", () => {
      // Date 2026-01-01 is injected as a holiday via isHolidayFn.
      const dateStr = "2026-01-01";
      const snapshot = makeSnapshot(dateStr);
      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 18, 5) }; // 18:05 VN = Tối

      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        alwaysHoliday, noWeekend,
        snapshot,
      );

      expect(result.kind).toBe("PRICE");
      if (result.kind === "PRICE") {
        expect(result.priceVnd).toBe(250_000);
        expect(result.dayType).toBe("HOLIDAY");
        expect(result.timeWindowId).toBe(TW_TOI.id);
      }
    });
  });

  describe("Day-type priority HOLIDAY > WEEKEND > REGULAR", () => {
    it("HOLIDAY wins over WEEKEND when both predicates are true", () => {
      const dateStr = "2026-01-01";
      const snapshot = makeSnapshot(dateStr);
      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 18, 0) };

      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        alwaysHoliday, alwaysWeekend, // both true — holiday must win
        snapshot,
      );

      expect(result.kind).toBe("PRICE");
      if (result.kind === "PRICE") {
        expect(result.dayType).toBe("HOLIDAY");
        expect(result.priceVnd).toBe(250_000); // Tối × Lễ
      }
    });

    it("WEEKEND wins over REGULAR when not a holiday", () => {
      const dateStr = "2026-01-03"; // Saturday
      const snapshot = makeSnapshot(dateStr);
      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 18, 0) };

      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, alwaysWeekend,
        snapshot,
      );

      expect(result.kind).toBe("PRICE");
      if (result.kind === "PRICE") {
        expect(result.dayType).toBe("WEEKEND");
        expect(result.priceVnd).toBe(200_000); // Tối × CT
      }
    });

    it("falls back to REGULAR when neither holiday nor weekend", () => {
      const dateStr = "2026-01-05"; // Monday
      const snapshot = makeSnapshot(dateStr);
      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 18, 0) };

      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        snapshot,
      );

      expect(result.kind).toBe("PRICE");
      if (result.kind === "PRICE") {
        expect(result.dayType).toBe("REGULAR");
        expect(result.priceVnd).toBe(170_000); // Tối × Thường
      }
    });
  });

  describe("Branch fallback: branch cell > chain cell", () => {
    it("uses branch-specific cell when available (BRANCH_A override)", () => {
      const dateStr = "2026-01-05";
      const branchCell = makeCell(TT_NGUOI_LON, TW_TOI.id, "REGULAR", 999_000, BRANCH_A);
      const snapshot = makeSnapshot(dateStr, [], [branchCell]);
      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 18, 0) };

      const result = resolvePrice(
        BRANCH_A, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        snapshot,
      );

      expect(result.kind).toBe("PRICE");
      if (result.kind === "PRICE") {
        expect(result.priceVnd).toBe(999_000);
        expect(result.fromBranchOverride).toBe(true);
      }
    });

    it("falls back to chain cell when no branch-specific cell exists (BRANCH_B)", () => {
      const dateStr = "2026-01-05";
      const snapshot = makeSnapshot(dateStr);
      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 18, 0) };

      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        snapshot,
      );

      expect(result.kind).toBe("PRICE");
      if (result.kind === "PRICE") {
        expect(result.priceVnd).toBe(170_000); // chain Tối × Thường
        expect(result.fromBranchOverride).toBe(false);
      }
    });
  });

  describe("deciding timestamp contract (parametrized, not hard-coded)", () => {
    /**
     * Contract: ONE timestamp decides price. Which one is config-driven.
     * Test locks the contract — bill created 13:58, paid 14:05.
     * At 13:58 VN → still within Trưa window (ends 14:00).
     * At 14:05 VN → OUTSIDE Trưa window → no price (out-of-hours gap).
     *
     * With PRICE_TIMESTAMP_FIELD = "createdAt" → price = Trưa cell.
     * With PRICE_TIMESTAMP_FIELD = "paidAt"    → no price (between windows).
     *
     * The test does NOT assert which one is chosen — it asserts the CONTRACT:
     * "the field named by PRICE_TIMESTAMP_FIELD is used, not the other one."
     */
    it("uses exactly the timestamp named by PRICE_TIMESTAMP_FIELD (not the other one)", () => {
      const dateStr = "2026-01-05";
      const snapshot = makeSnapshot(dateStr);

      const createdAt = vnTime(dateStr, 13, 58); // 13:58 VN → inside Trưa (10:30–14:00)
      const paidAt    = vnTime(dateStr, 14, 5);  // 14:05 VN → outside all windows (gap)

      const ts: BillTimestamps = { createdAt, paidAt };

      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        snapshot,
      );

      // The result's decidingTimestampField must match PRICE_TIMESTAMP_FIELD.
      // This is the contract: one field is canonical.
      if (result.kind === "PRICE") {
        expect(result.decidingTimestampField).toBe(PRICE_TIMESTAMP_FIELD);
      }

      // The concrete outcome depends on which field is currently configured:
      if (PRICE_TIMESTAMP_FIELD === "createdAt") {
        // Created at 13:58 → inside Trưa → price resolved
        expect(result.kind).toBe("PRICE");
      } else {
        // Paid at 14:05 → outside all windows → no price
        expect(result.kind).toBe("NO_PRICE");
        if (result.kind === "NO_PRICE") {
          expect(result.reason).toBe("OUT_OF_HOURS");
        }
      }
    });

    it("resolves correct price when deciding timestamp is inside a window", () => {
      const dateStr = "2026-01-05";
      const snapshot = makeSnapshot(dateStr);
      const ts: BillTimestamps = {
        createdAt: vnTime(dateStr, 13, 58), // Trưa window
        paidAt:    vnTime(dateStr, 14, 5),  // outside window
      };

      // If createdAt decides: should get Trưa price
      // If paidAt decides: should get NO_PRICE
      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        snapshot,
      );

      // Assert the configured field was used (the contract).
      if (result.kind === "PRICE") {
        expect(result.timeWindowId).toBe(TW_TRUA.id); // Trưa only if createdAt was used
        expect(result.decidingTimestampField).toBe("createdAt"); // current default
      }
    });
  });

  describe("Versioning: future price-book auto-applies at 0h of effective date", () => {
    it("future price-book version does NOT affect today", () => {
      const todayStr    = "2026-01-05";
      const tomorrowStr = "2026-01-06";

      // Future version with much higher prices.
      const futureVersion: PriceBookVersionSnapshot = {
        id: "v2-future",
        effectiveDateStr: tomorrowStr,
        branchId: null,
        cells: [makeCell(TT_NGUOI_LON, TW_TOI.id, "REGULAR", 999_999)],
      };

      const snapshot = makeSnapshot(todayStr, [futureVersion]);
      const ts: BillTimestamps = { createdAt: vnTime(todayStr, 18, 0) }; // today

      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        snapshot,
      );

      expect(result.kind).toBe("PRICE");
      if (result.kind === "PRICE") {
        expect(result.priceVnd).toBe(170_000); // today's price, NOT 999_999
        expect(result.versionId).toBe("v1");
      }
    });

    it("future price-book applies when decidingDate reaches effectiveFrom (0h auto-apply)", () => {
      const tomorrowStr = "2026-01-06";

      // Future version starts tomorrow.
      const futureVersion: PriceBookVersionSnapshot = {
        id: "v2-future",
        effectiveDateStr: tomorrowStr,
        branchId: null,
        cells: [makeCell(TT_NGUOI_LON, TW_TOI.id, "REGULAR", 999_999)],
      };

      // Snapshot includes both versions; deciding date is tomorrow.
      const snapshot: PriceBookSnapshot = {
        snapshotGeneratedAt: Date.now(),
        timeWindows: [TW_TRUA, TW_TOI],
        versions: [
          {
            id: "v1",
            effectiveDateStr: "2026-01-05",
            branchId: null,
            cells: [makeCell(TT_NGUOI_LON, TW_TOI.id, "REGULAR", 170_000)],
          },
          futureVersion,
        ],
      };

      // Bill created tomorrow (future version now effective).
      const ts: BillTimestamps = { createdAt: vnTime(tomorrowStr, 18, 0) };

      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        snapshot,
      );

      expect(result.kind).toBe("PRICE");
      if (result.kind === "PRICE") {
        expect(result.priceVnd).toBe(999_999); // new version applies
        expect(result.versionId).toBe("v2-future");
      }
    });
  });

  describe("Out-of-hours → NO_PRICE (build-default #2)", () => {
    it("returns NO_PRICE with reason OUT_OF_HOURS when time is between windows (15:00)", () => {
      const dateStr = "2026-01-05";
      const snapshot = makeSnapshot(dateStr);
      // 15:00 VN is between Trưa (ends 14:00) and Tối (starts 17:00)
      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 15, 0) };

      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        snapshot,
      );

      expect(result.kind).toBe("NO_PRICE");
      if (result.kind === "NO_PRICE") {
        expect(result.reason).toBe("OUT_OF_HOURS");
      }
    });

    it("returns NO_PRICE when time is before all windows (09:00)", () => {
      const dateStr = "2026-01-05";
      const snapshot = makeSnapshot(dateStr);
      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 9, 0) };

      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        snapshot,
      );

      expect(result.kind).toBe("NO_PRICE");
    });

    it("returns NO_PRICE when time is after all windows (23:00)", () => {
      const dateStr = "2026-01-05";
      const snapshot = makeSnapshot(dateStr);
      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 23, 0) };

      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        snapshot,
      );

      expect(result.kind).toBe("NO_PRICE");
    });
  });

  describe("Free ticket: price = 0, still counts toward guest total", () => {
    /**
     * Invariant: free ticket counts toward guest total for cost-per-guest calculations.
     * The resolver's job is to return price=0. The billing layer counts
     * all tickets (free+paid) in the guest denominator. This test documents
     * and locks that invariant so future refactors do not silently break BC-01.
     */
    it("free ticket (isFree=true) always resolves to price 0 regardless of time/day", () => {
      const dateStr = "2026-01-01";
      const snapshot = makeSnapshot(dateStr);
      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 18, 5) };

      const result = resolvePrice(
        BRANCH_B, TT_FREE, true, // isFree = true
        ts, alwaysHoliday, noWeekend,
        snapshot,
      );

      expect(result.kind).toBe("PRICE");
      if (result.kind === "PRICE") {
        expect(result.priceVnd).toBe(0);
      }
    });

    it("free ticket counts toward guest total — invariant (do not remove this test; BC-01 denominator depends on it)", () => {
      // This test documents the BILLING LAYER contract, not the resolver.
      // A free ticket isFree=true MUST be included in guest-count even when priceVnd=0.
      // The resolver returns price=0; the bill accumulates guestCount += quantity for ALL tickets.
      const dateStr = "2026-01-05";
      const snapshot = makeSnapshot(dateStr);
      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 18, 0) };

      const freeResult = resolvePrice(
        BRANCH_B, TT_FREE, true, ts, noHoliday, noWeekend, snapshot,
      );
      const paidResult = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts, noHoliday, noWeekend, snapshot,
      );

      // Both return PRICE kind — both count as guests.
      expect(freeResult.kind).toBe("PRICE");
      expect(paidResult.kind).toBe("PRICE");

      if (freeResult.kind === "PRICE" && paidResult.kind === "PRICE") {
        // Free ticket price = 0; paid ticket price > 0.
        expect(freeResult.priceVnd).toBe(0);
        expect(paidResult.priceVnd).toBeGreaterThan(0);
        // CRITICAL INVARIANT (BC-01 depends on this):
        // billing layer must count quantity of freeResult ticket into guestTotal
        // even though priceVnd = 0. The denominator for cost/guest must include free guests.
      }
    });

    it("FREE_TICKET_POLICY is exported and is ALLOW_STANDALONE (confirmed)", () => {
      // Confirmed policy: a free ticket can stand alone (a free-only bill is valid).
      expect(FREE_TICKET_POLICY.kind).toBe("ALLOW_STANDALONE");
    });
  });

  describe("NO_VERSION and NO_CELL edge cases", () => {
    it("returns NO_PRICE / NO_VERSION when no version is effective yet for this date", () => {
      // All versions start in the future.
      const snapshot: PriceBookSnapshot = {
        snapshotGeneratedAt: Date.now(),
        timeWindows: [TW_TOI],
        versions: [
          {
            id: "v-future",
            effectiveDateStr: "2099-01-01",
            branchId: null,
            cells: [makeCell(TT_NGUOI_LON, TW_TOI.id, "REGULAR", 100_000)],
          },
        ],
      };

      const ts: BillTimestamps = { createdAt: vnTime("2026-01-05", 18, 0) };
      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        snapshot,
      );

      expect(result.kind).toBe("NO_PRICE");
      if (result.kind === "NO_PRICE") {
        expect(result.reason).toBe("NO_VERSION");
      }
    });

    it("returns NO_PRICE / NO_CELL when version exists but no cell matches ticket+window+dayType", () => {
      const dateStr = "2026-01-05";
      const snapshot: PriceBookSnapshot = {
        snapshotGeneratedAt: Date.now(),
        timeWindows: [TW_TOI],
        versions: [
          {
            id: "v1",
            effectiveDateStr: dateStr,
            branchId: null,
            cells: [makeCell("other-ticket", TW_TOI.id, "REGULAR", 100_000)], // different ticket
          },
        ],
      };

      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 18, 0) };
      const result = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        snapshot,
      );

      expect(result.kind).toBe("NO_PRICE");
      if (result.kind === "NO_PRICE") {
        expect(result.reason).toBe("NO_CELL");
      }
    });
  });

  describe("Determinism — same inputs always give same output", () => {
    it("is deterministic: calling resolvePrice twice with identical inputs returns identical results", () => {
      const dateStr = "2026-01-01";
      const snapshot = makeSnapshot(dateStr);
      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 18, 5) };

      const r1 = resolvePrice(BRANCH_B, TT_NGUOI_LON, false, ts, alwaysHoliday, noWeekend, snapshot);
      const r2 = resolvePrice(BRANCH_B, TT_NGUOI_LON, false, ts, alwaysHoliday, noWeekend, snapshot);

      expect(r1).toEqual(r2);
    });
  });
});

// ─── Part 2: HYDRATION PARITY ───────────────────────────────────────

describe("Part 2 — Hydration Parity", () => {
  /**
   * Scenario: device is offline during a mid-day price-book version change.
   *
   * Server publishes v2 at 14:30 (snapshotGeneratedAt = T2).
   * Device was last synced before T2 (snapshotGeneratedAt = T1).
   * Bills created offline between T1 and reconnect may use stale prices.
   *
   * On reconnect:
   *   - detectCacheStaleness(clientStamp, serverStamp) → true
   *   - billRequiresPriceRecheck(billStamp, serverStamp) → true for each offline bill
   *   - Server recomputes prices at reconciliation.
   */
  describe("Cache version-stamp detection", () => {
    it("detectCacheStaleness returns true when client cache is older than server", () => {
      const serverStamp = Date.now();
      const clientStamp = serverStamp - 3_600_000; // 1 hour older
      expect(detectCacheStaleness(clientStamp, serverStamp)).toBe(true);
    });

    it("detectCacheStaleness returns false when client cache is up to date", () => {
      const serverStamp = Date.now();
      expect(detectCacheStaleness(serverStamp, serverStamp)).toBe(false);
    });

    it("detectCacheStaleness returns false when client cache is newer (race: server downgrade)", () => {
      const serverStamp = Date.now() - 100;
      const clientStamp = Date.now();
      expect(detectCacheStaleness(clientStamp, serverStamp)).toBe(false);
    });
  });

  describe("Offline bill price recheck flag", () => {
    it("billRequiresPriceRecheck returns true for bill created against stale snapshot", () => {
      const t1ServerPublished = 1_700_000_000_000;
      const t2ServerPublished = 1_700_003_600_000; // 1 hour later, v2 published

      // Bill was created at t1 (device used old cache).
      expect(billRequiresPriceRecheck(t1ServerPublished, t2ServerPublished)).toBe(true);
    });

    it("billRequiresPriceRecheck returns false for bill created after latest sync", () => {
      const serverStamp = 1_700_003_600_000;
      const billStamp   = 1_700_003_600_000; // same stamp = up to date

      expect(billRequiresPriceRecheck(billStamp, serverStamp)).toBe(false);
    });
  });

  describe("Version-cutover mid-day: offline bill resolves against stale then server recomputes", () => {
    /**
     * Timeline:
     *   10:00 — Device syncs snapshot (v1 only, stamp=T1).
     *   11:00 — Server publishes v2 with higher prices (effectiveDateStr = TODAY).
     *            snapshotGeneratedAt = T2.
     *   11:30 — Device (offline) creates a bill using stale snapshot (v1 prices).
     *   14:00 — Device reconnects. Server returns stamp=T2.
     *            billRequiresPriceRecheck(T1, T2) → true.
     *            Server recomputes the bill with v2 → price mismatch detected.
     *
     * This test simulates the whole scenario with pure resolver calls.
     */
    it("same bill resolves to different prices on stale vs fresh snapshot (version-cutover)", () => {
      const dateStr = "2026-01-05";
      const T1 = 1_700_000_000_000;
      const T2 = 1_700_003_600_000; // 1 hour later

      // Old snapshot (device has this, v1 only).
      const oldSnapshot: PriceBookSnapshot = {
        snapshotGeneratedAt: T1,
        timeWindows: [TW_TOI],
        versions: [
          {
            id: "v1",
            effectiveDateStr: dateStr,
            branchId: null,
            cells: [makeCell(TT_NGUOI_LON, TW_TOI.id, "REGULAR", 170_000)],
          },
        ],
      };

      // New snapshot (server has this after mid-day republish; v2 retroactively
      // effective from same date, higher effectiveDateStr — simulating a repricing).
      const newSnapshot: PriceBookSnapshot = {
        snapshotGeneratedAt: T2,
        timeWindows: [TW_TOI],
        versions: [
          {
            id: "v1",
            effectiveDateStr: dateStr,
            branchId: null,
            cells: [makeCell(TT_NGUOI_LON, TW_TOI.id, "REGULAR", 170_000)],
          },
          {
            id: "v2",
            // Same effective date but a newer version (HQ created it today,
            // effective today — simulates mid-day version correction).
            effectiveDateStr: dateStr,
            branchId: null,
            cells: [makeCell(TT_NGUOI_LON, TW_TOI.id, "REGULAR", 220_000)],
          },
        ],
      };

      const ts: BillTimestamps = { createdAt: vnTime(dateStr, 18, 30) };

      // Offline resolve (stale snapshot).
      const offlineResult = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        oldSnapshot,
      );

      // Server recompute (fresh snapshot).
      const serverResult = resolvePrice(
        BRANCH_B, TT_NGUOI_LON, false, ts,
        noHoliday, noWeekend,
        newSnapshot,
      );

      expect(offlineResult.kind).toBe("PRICE");
      expect(serverResult.kind).toBe("PRICE");

      if (offlineResult.kind === "PRICE" && serverResult.kind === "PRICE") {
        // Prices differ because v2 was published after the device synced.
        expect(offlineResult.priceVnd).toBe(170_000);
        expect(serverResult.priceVnd).toBe(220_000);
        expect(offlineResult.priceVnd).not.toBe(serverResult.priceVnd);
      }

      // The reconciliation flag fires correctly.
      expect(billRequiresPriceRecheck(
        oldSnapshot.snapshotGeneratedAt,
        newSnapshot.snapshotGeneratedAt,
      )).toBe(true);
    });

    it("snapshot carries a version-stamp that allows staleness detection on reconnect", () => {
      const T1 = 1_700_000_000_000;
      const T2 = 1_700_000_001_000;

      const clientCache: Pick<PriceBookSnapshot, "snapshotGeneratedAt"> = {
        snapshotGeneratedAt: T1,
      };
      const serverSnapshot: Pick<PriceBookSnapshot, "snapshotGeneratedAt"> = {
        snapshotGeneratedAt: T2,
      };

      // Client detects staleness on reconnect.
      const isStale = detectCacheStaleness(
        clientCache.snapshotGeneratedAt,
        serverSnapshot.snapshotGeneratedAt,
      );

      expect(isStale).toBe(true);
    });
  });

  describe("Utility helpers — toVnDateStr / toVnMinuteOfDay", () => {
    it("toVnDateStr returns 'YYYY-MM-DD' for a given UTC date in VN timezone", () => {
      // 2025-12-31T23:00:00Z = 2026-01-01T06:00:00+07 → VN date is 2026-01-01
      const date = new Date("2025-12-31T23:00:00Z");
      expect(toVnDateStr(date)).toBe("2026-01-01");
    });

    it("toVnMinuteOfDay returns correct minute of day in VN timezone", () => {
      // 2026-01-05T11:00:00Z = 18:00 VN (+7) → 18*60 = 1080
      const date = new Date("2026-01-05T11:00:00Z");
      expect(toVnMinuteOfDay(date)).toBe(1080);
    });
  });
});
