# L0 — FIFO engine (thuần hàm)

**Goal:** hàm FIFO tính COGS bán từ chuỗi movement, test kỹ, không phụ thuộc DB.

## Vị trí
- `apps/api/src/inventory/reports/fifo-cogs.ts` — hàm thuần + kiểu.

## API
```ts
interface FifoMovement {
  type: "RECEIPT" | "ISSUE" | "ADJUST";
  qtyBase: number;        // signed (+in / −out)
  unitCostVnd: number | null;
  refType: string | null; // "BILL" = bán; "PO"/"BILL_REVERSAL"/... khác
  dayKey: string | null;  // businessDate của bill (chỉ outflow BILL) để bucket
}
interface FifoResult { totalCogsVnd: number; byDay: Record<string, number>; }
function fifoCogs(movements: FifoMovement[]): FifoResult;
```
- Duyệt theo thứ tự đã sắp (caller sort theo createdAt).
- qty>0 → đẩy lô {qty, cost=unitCostVnd??0}. qty<0 → tiêu FIFO:
  - cost outflow = Σ (lấy từ lô × giá lô); thiếu lô → phần thiếu × (giá lô cuối
    dùng hoặc unitCostVnd??0).
  - nếu refType=="BILL" → cộng cost vào totalCogsVnd + byDay[dayKey].
  - BILL_REVERSAL (qty>0) → đẩy lô ở unitCostVnd (hoàn hàng) → tự nhiên giảm COGS
    kỳ sau; và trừ COGS byDay nếu cùng ngày? Giữ đơn giản: reversal là RECEIPT-lô.
- Dùng roundVnd cho từng cost lô (money). Không raw `*` trên biến tên tiền
  (đặt biến `cost`/`price` trung tính hoặc eslint-disable có lý do).

## Tests (unit, Jest)
- 1 lô: nhập 10@1000, bán 4 (BILL) → COGS 4000.
- 2 lô giá khác: nhập 10@1000 rồi 10@1500; bán 12 (BILL) → 10×1000+2×1500=13000.
- Bán quá tồn (thiếu lô) → phần thiếu định giá theo giả định, không NaN.
- ISSUE (hao, refType null) tiêu lô nhưng KHÔNG vào COGS bán.
- byDay: 2 bill khác ngày → COGS tách đúng theo dayKey.
- REVERSAL đẩy lô lại (không âm COGS bất thường).

## Risks
- Xác định rõ giả định thiếu-lô; ghi comment. Thuần hàm ⇒ dễ test, không chạm DB.
