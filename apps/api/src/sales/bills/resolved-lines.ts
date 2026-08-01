/**
 * Shared bill-line resolution for online create and offline sync.
 *
 * Both paths take client lines (ticketTypeId + qty, NO price), look up the
 * ticket type, resolve the server-authoritative price, and build the immutable
 * snapshot line. They differ only in how a missing price is handled:
 *   - online create rejects (the cashier can pick a valid window/price)
 *   - offline sync accepts at price 0 and flags for accounting (never reject a
 *     sale that was already printed and settled on paper)
 *
 * Quantities are always validated as positive integers: a non-integer or
 * negative qty is corruption, not a legitimate sale, on either path.
 */
import { BadRequestException } from "@nestjs/common";
import { multiplyVnd } from "@ilikebuffet/shared";
import type { PriceResolver } from "../pricing/pricing.service";

export interface ResolvedLine {
  ticketTypeId: string;
  ticketTypeName: string;
  unitPriceVnd: number;
  qty: number;
  lineTotalVnd: number;
  isFree: boolean;
  timeWindowId: string | null;
  timeWindowName: string | null;
  dayType: string | null;
  priceVersionId: string | null;
}

export interface LineInput {
  ticketTypeId: string;
  qty: number;
}

export interface TicketTypeInfo {
  name: string;
  isFree: boolean;
}

export function buildResolvedLines(
  lines: readonly LineInput[],
  ticketTypeById: ReadonlyMap<string, TicketTypeInfo>,
  resolver: PriceResolver,
  opts: { rejectOnNoPrice: boolean },
): ResolvedLine[] {
  return lines.map((line) => {
    if (!Number.isInteger(line.qty) || line.qty < 1) {
      throw new BadRequestException("qty phải là số nguyên dương");
    }

    const ticketType = ticketTypeById.get(line.ticketTypeId);
    if (!ticketType) {
      throw new BadRequestException(`TicketType ${line.ticketTypeId} not found`);
    }

    const price = resolver.resolve(line.ticketTypeId, ticketType.isFree);
    if (price.kind === "NO_PRICE" && opts.rejectOnNoPrice) {
      throw new BadRequestException("Ngoài khung giờ hoặc chưa có giá");
    }

    const unitPriceVnd = price.kind === "PRICE" ? price.priceVnd : 0;
    return {
      ticketTypeId: line.ticketTypeId,
      ticketTypeName: ticketType.name,
      unitPriceVnd,
      qty: line.qty,
      lineTotalVnd: multiplyVnd(unitPriceVnd, line.qty),
      isFree: ticketType.isFree,
      timeWindowId: price.kind === "PRICE" ? (price.timeWindowId ?? null) : null,
      timeWindowName: price.kind === "PRICE" ? resolver.timeWindowName(price.timeWindowId) : null,
      dayType: price.kind === "PRICE" ? (price.dayType ?? null) : null,
      priceVersionId: price.kind === "PRICE" ? (price.versionId ?? null) : null,
    };
  });
}
