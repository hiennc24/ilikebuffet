/**
 * Offline pricing: price a ticket from the cached snapshot using
 * the SAME pure resolver the server uses, so an offline estimate matches what
 * the server will recompute on sync (the server remains authoritative).
 *
 * Holidays are not cached for offline use, so a holiday degrades to its
 * weekday/weekend rate offline; the server corrects it on sync.
 */

import { resolvePrice, toVnDayOfWeek, type PriceBookSnapshot } from "@ilikebuffet/shared";
import type { CachedTicketType } from "../db/pos-db";

const isVnWeekend = (d: Date): boolean => {
  const dow = toVnDayOfWeek(d);
  return dow === 0 || dow === 6; // Sun or Sat
};

const noHolidayOffline = (): boolean => false;

/**
 * Resolve a ticket's unit price offline. Returns the integer VND price, or null
 * if the ticket is out of hours / has no effective cell (NO_PRICE).
 */
export function resolveOfflinePrice(
  snapshot: PriceBookSnapshot,
  branchId: string,
  ticket: CachedTicketType,
  createdAt: Date,
): number | null {
  const result = resolvePrice(
    branchId,
    ticket.id,
    ticket.isFree,
    { createdAt },
    noHolidayOffline,
    isVnWeekend,
    snapshot,
  );
  return result.kind === "PRICE" ? result.priceVnd : null;
}
