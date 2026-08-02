# W2 — Nhập kho (Goods receipt)

**Goal:** nhập hàng thực tế → tạo StockMovement (RECEIPT) + cập nhật tồn + giá vốn TB.

## Backend
- `POST /inventory/purchase-orders/:id/receive` — { lines:[{ ingredientId, unitId, qty,
  unitPriceVnd? }] } — nhận thực tế (có thể khác PO). Với mỗi dòng:
  - qtyBase = qty × factorToBase(unitId của nguyên liệu) → cộng vào tồn (base unit).
  - StockMovement(type=RECEIPT, qtyBase>0, unitCostVnd = đơn giá/1 base unit, ref=PO).
  - Cập nhật `InventoryBalance` in-tx (re-read chống đua): qtyBase += ; avgCost =
    moving-average = roundVnd((oldQty*oldAvg + recvQty*recvCost)/(oldQty+recvQty)).
  - PO → RECEIVED (hoặc PARTIAL nếu chốt; MVP: RECEIVED khi nhận).
  - Audit `stock.receipt`.
- `POST /inventory/receipts` — nhập ad-hoc không cần PO (tuỳ chọn MVP; có thể bỏ).

## Frontend
- Trong PO detail (SENT): nút "Nhập kho" → dialog các dòng (mặc định theo PO, sửa qty/giá)
  → xác nhận. Hiện tồn mới sau nhập.

## Tests
- e2e: nhập PO → balance tăng đúng qtyBase (quy đổi factorToBase); avgCost đúng công thức
  TB gia quyền qua 2 lần nhập; movement RECEIPT ghi; PO→RECEIVED; branch-scope; role gate.
- Concurrency: 2 lần nhập cùng nguyên liệu không mất cập nhật (re-read trong tx).

## Risks
- Moving-average: dùng integer VND (roundVnd) cho avgCost; tránh chia 0 (qty mới = recv).
- factorToBase lấy từ IngredientPurchaseUnit đúng (unitId ↔ ingredient).
