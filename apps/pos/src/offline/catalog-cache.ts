/**
 * Catalog cache (P8): mirror the pricing catalog to Dexie so the device can
 * price and sell offline — including a cold boot with no network — using the
 * SAME shared resolver the server uses. Refreshed on every successful online
 * load of the sell screen.
 *
 * Cached: the price-book snapshot (incl. future-dated versions), ticket types,
 * and the branch code (for offline temp numbers). Holidays are NOT cached in
 * M1; offline pricing degrades a holiday to its weekday/weekend rate and the
 * server recomputes the authoritative price on sync (C2) — the offline price is
 * only an on-screen estimate.
 */

import { posDb, type CatalogCache, type CachedTicketType } from "../db/pos-db";
import type { PriceBookSnapshot } from "@ilikebuffet/shared";

export interface CatalogApi {
  get<T>(path: string): Promise<T>;
}

interface BranchResp {
  id: string;
  code?: string;
}

/**
 * Fetch the catalog for a branch and store it. Returns the cached record, or
 * null if any fetch failed (caller stays on whatever was previously cached).
 */
export async function refreshCatalog(api: CatalogApi, branchId: string): Promise<CatalogCache | null> {
  try {
    const [snapshot, ticketTypes, branches] = await Promise.all([
      api.get<PriceBookSnapshot>("/sales/pricing/versions/snapshot"),
      api.get<CachedTicketType[]>("/sales/ticket-types"),
      api.get<BranchResp[] | { data: BranchResp[] }>("/branches"),
    ]);
    const list = Array.isArray(branches) ? branches : branches.data ?? [];
    const branchCode = list.find((b) => b.id === branchId)?.code ?? "CN";

    const record: CatalogCache = {
      branchId,
      branchCode,
      snapshot,
      ticketTypes: ticketTypes.filter((t) => (t as { status?: string }).status !== "INACTIVE"),
      cachedAt: new Date().toISOString(),
    };
    await posDb.catalog_cache.put(record);
    return record;
  } catch {
    return null;
  }
}

/** Read the cached catalog for a branch (null if never cached). */
export async function getCachedCatalog(branchId: string): Promise<CatalogCache | null> {
  return (await posDb.catalog_cache.get(branchId)) ?? null;
}
