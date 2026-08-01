/**
 * Offline catalog cache + offline pricing (P8: cold-boot offline).
 * Proves the cache round-trips and that offline pricing (shared resolver over
 * the cached snapshot) yields the effective-version price for the day type.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import type { PriceBookSnapshot } from "@ilikebuffet/shared";
import { posDb, type CachedTicketType } from "../db/pos-db";
import { refreshCatalog, getCachedCatalog, type CatalogApi } from "./catalog-cache";
import { resolveOfflinePrice } from "./offline-pricing";

const TICKETS: CachedTicketType[] = [
  { id: "tt-1", name: "Người lớn", color: "#000", displayOrder: 1, isFree: false },
  { id: "tt-free", name: "Vé mời", displayOrder: 2, isFree: true },
];

// A snapshot with a current (200k) and a future (250k) version; weekend cells.
const SNAPSHOT: PriceBookSnapshot = {
  snapshotGeneratedAt: 0,
  timeWindows: [{ id: "tw-1", name: "Cả ngày", startMinute: 0, endMinute: 1440 }],
  versions: [
    {
      id: "v-cur",
      effectiveDateStr: "2026-07-01",
      branchId: null,
      cells: (["REGULAR", "WEEKEND", "HOLIDAY"] as const).map((dt) => ({
        ticketTypeId: "tt-1", timeWindowId: "tw-1", dayType: dt, priceVnd: 200000, branchId: null,
      })),
    },
    {
      id: "v-fut",
      effectiveDateStr: "2026-08-10",
      branchId: null,
      cells: (["REGULAR", "WEEKEND", "HOLIDAY"] as const).map((dt) => ({
        ticketTypeId: "tt-1", timeWindowId: "tw-1", dayType: dt, priceVnd: 250000, branchId: null,
      })),
    },
  ],
};

function fakeApi(): CatalogApi {
  return {
    get: (async (path: string) => {
      if (path.startsWith("/sales/pricing/versions/snapshot")) return SNAPSHOT;
      if (path.startsWith("/sales/ticket-types")) return TICKETS;
      if (path.startsWith("/branches")) return { data: [{ id: "branch-1", code: "CN01" }] };
      throw new Error("unexpected " + path);
    }) as CatalogApi["get"],
  };
}

beforeEach(async () => {
  await posDb.catalog_cache.clear();
});

describe("catalog cache", () => {
  it("refreshCatalog stores snapshot + tickets + branch code; getCachedCatalog reads it", async () => {
    const rec = await refreshCatalog(fakeApi(), "branch-1");
    expect(rec).not.toBeNull();
    expect(rec!.branchCode).toBe("CN01");
    expect(rec!.ticketTypes).toHaveLength(2);

    const read = await getCachedCatalog("branch-1");
    expect(read?.branchCode).toBe("CN01");
    expect((read?.snapshot as PriceBookSnapshot).versions).toHaveLength(2);
  });

  it("returns null and leaves cache intact when a fetch fails", async () => {
    const api: CatalogApi = { get: (async () => { throw new Error("offline"); }) as CatalogApi["get"] };
    expect(await refreshCatalog(api, "branch-1")).toBeNull();
  });
});

describe("offline pricing parity", () => {
  const adult = TICKETS[0];
  const free = TICKETS[1];

  it("prices from the current version on a date before the future version", () => {
    const price = resolveOfflinePrice(SNAPSHOT, "branch-1", adult, new Date("2026-08-01T13:00:00+07:00"));
    expect(price).toBe(200000);
  });

  it("prices from the future version once its effective date has arrived (BH-05.6f)", () => {
    const price = resolveOfflinePrice(SNAPSHOT, "branch-1", adult, new Date("2026-08-11T13:00:00+07:00"));
    expect(price).toBe(250000);
  });

  it("prices a free ticket at 0", () => {
    expect(resolveOfflinePrice(SNAPSHOT, "branch-1", free, new Date("2026-08-01T13:00:00+07:00"))).toBe(0);
  });
});
