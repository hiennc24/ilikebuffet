import { fifoCogs, type FifoMovement } from "./fifo-cogs";

const receipt = (qty: number, cost: number): FifoMovement => ({ type: "RECEIPT", qtyBase: qty, unitCostVnd: cost, refType: "PO", dayKey: null });
const sale = (qty: number, day: string): FifoMovement => ({ type: "ISSUE", qtyBase: -qty, unitCostVnd: null, refType: "BILL", dayKey: day });
const issue = (qty: number): FifoMovement => ({ type: "ISSUE", qtyBase: -qty, unitCostVnd: null, refType: null, dayKey: null });

describe("fifoCogs", () => {
  it("values a sale from a single lot", () => {
    const r = fifoCogs([receipt(10, 1000), sale(4, "2026-08-03")]);
    expect(r.totalCogsVnd).toBe(4000);
    expect(r.byDay["2026-08-03"]).toBe(4000);
  });

  it("consumes across two lots oldest-first at their real costs", () => {
    // 10 @ 1000 then 10 @ 1500; sell 12 → 10×1000 + 2×1500 = 13000.
    const r = fifoCogs([receipt(10, 1000), receipt(10, 1500), sale(12, "2026-08-03")]);
    expect(r.totalCogsVnd).toBe(13_000);
  });

  it("buckets COGS by the bill's day", () => {
    const r = fifoCogs([receipt(100, 1000), sale(3, "2026-08-01"), sale(5, "2026-08-02")]);
    expect(r.byDay["2026-08-01"]).toBe(3000);
    expect(r.byDay["2026-08-02"]).toBe(5000);
    expect(r.totalCogsVnd).toBe(8000);
  });

  it("does not count a manual (non-BILL) issue as cost of goods sold", () => {
    // Issue depletes the lot but is wastage, not a sale.
    const r = fifoCogs([receipt(10, 1000), issue(4), sale(2, "2026-08-03")]);
    // Sale consumes from the remaining lot (still @1000) → 2000; issue excluded.
    expect(r.totalCogsVnd).toBe(2000);
  });

  it("depletes the older lot before a later one across an interleaved issue", () => {
    const r = fifoCogs([receipt(5, 1000), receipt(5, 2000), issue(5), sale(3, "2026-08-03")]);
    // Issue takes the 5 @1000 lot; the sale then draws 3 from the 5 @2000 → 6000.
    expect(r.totalCogsVnd).toBe(6000);
  });

  it("values a shortfall (sold beyond stock) at the last known cost, no NaN", () => {
    const r = fifoCogs([receipt(2, 1000), sale(5, "2026-08-03")]);
    // 2 @1000 + shortfall 3 @1000 (last lot cost) = 5000.
    expect(r.totalCogsVnd).toBe(5000);
    expect(Number.isNaN(r.totalCogsVnd)).toBe(false);
  });

  it("returns goods to stock on a reversal so later sales use them", () => {
    const reversal: FifoMovement = { type: "RECEIPT", qtyBase: 2, unitCostVnd: 1000, refType: "BILL_REVERSAL", dayKey: null };
    const r = fifoCogs([receipt(2, 1000), sale(2, "2026-08-03"), reversal, sale(2, "2026-08-04")]);
    // First sale 2×1000; reversal returns 2 @1000; second sale draws them → 2000 each.
    expect(r.byDay["2026-08-03"]).toBe(2000);
    expect(r.byDay["2026-08-04"]).toBe(2000);
    expect(r.totalCogsVnd).toBe(4000);
  });
});
