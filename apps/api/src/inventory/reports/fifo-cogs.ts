/**
 * FIFO cost-of-goods engine (pure) — computes the actual per-lot cost of goods
 * SOLD from a chronological stock-movement ledger, as an alternative view to the
 * moving-average cost the InventoryBalance maintains. No DB, no side effects.
 *
 * RECEIPT movements are the lots (quantity in + actual unit cost). Outflows
 * consume the oldest lots first; a sale (refType "BILL") adds its consumed lot
 * cost to COGS, bucketed by the bill's business day. Manual issues and stock-take
 * shrinkage deplete lots but are not counted as cost of goods SOLD.
 *
 * Assumptions (documented — a buffet sale is never blocked on stock, so on-hand
 * can go negative): when an outflow exceeds the lots on hand, the shortfall is
 * valued at the last lot cost seen, or the movement's own unitCostVnd, else 0.
 */
import { roundVnd, sumVnd } from "@ilikebuffet/shared";

export interface FifoMovement {
  type: "RECEIPT" | "ISSUE" | "ADJUST";
  /** Signed base-unit quantity (+ in / − out). */
  qtyBase: number;
  unitCostVnd: number | null;
  /** "BILL" = a sale (counts toward COGS); other tags deplete but don't. */
  refType: string | null;
  /** The bill's business day for a sale outflow — the COGS bucket key. */
  dayKey: string | null;
}

export interface FifoCogsResult {
  totalCogsVnd: number;
  byDay: Record<string, number>;
}

interface Lot {
  qty: number;
  cost: number; // integer VND per base unit
}

const roundQty = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Replay `movements` (already ordered oldest-first) through a FIFO lot queue and
 * return the cost of goods sold (refType "BILL" outflows), overall and per day.
 */
export function fifoCogs(movements: FifoMovement[]): FifoCogsResult {
  const lots: Lot[] = [];
  let lastLotCost = 0;
  let totalCogsVnd = 0;
  const byDay: Record<string, number> = {};

  for (const m of movements) {
    const qty = roundQty(m.qtyBase);
    if (qty > 0) {
      // A lot enters stock (purchase receipt, adjust-up, or a sale reversal).
      const cost = m.unitCostVnd ?? lastLotCost;
      lots.push({ qty, cost });
      lastLotCost = cost;
      continue;
    }
    if (qty === 0) continue;

    // An outflow: consume the oldest lots first, accumulating their cost.
    let need = -qty;
    let outflowCostVnd = 0;
    while (need > 0 && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(need, lot.qty);
      outflowCostVnd = sumVnd([outflowCostVnd, roundVnd(take * lot.cost)]);
      lot.qty = roundQty(lot.qty - take);
      need = roundQty(need - take);
      if (lot.qty <= 0) lots.shift();
    }
    if (need > 0) {
      // Sold more than was ever received (estimated recipe outran stock): value
      // the shortfall at the best cost we know.
      const fallback = m.unitCostVnd ?? lastLotCost;
      outflowCostVnd = sumVnd([outflowCostVnd, roundVnd(need * fallback)]);
    }

    if (m.refType === "BILL") {
      totalCogsVnd = sumVnd([totalCogsVnd, outflowCostVnd]);
      const key = m.dayKey ?? "unknown";
      byDay[key] = sumVnd([byDay[key] ?? 0, outflowCostVnd]);
    }
  }

  return { totalCogsVnd, byDay };
}
