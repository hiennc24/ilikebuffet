# W3 — Tồn kho + Xuất/Điều chỉnh

**Goal:** xem tồn hiện tại + tồn thấp; xuất kho (hao hụt) / điều chỉnh kiểm kê.

## Backend
- `GET /inventory/stock?branchId&q&lowOnly&page&pageSize` — tồn theo (chi nhánh, nguyên
  liệu): qtyBase, avgCostVnd, valueVnd = roundVnd(qtyBase×avgCost), minStock, lowStock
  (qtyBase < defaultMinStock). Branch-scoped.
- `GET /inventory/movements?branchId&ingredientId&from&to&page&pageSize` — lịch sử chuyển động.
- `POST /inventory/stock/issue` — { branchId, ingredientId, qtyBase, note } — xuất (hao/huỷ):
  movement ISSUE (qtyBase<0), giảm tồn. **Q1:** chặn nếu vượt tồn (balance<0) hoặc cảnh báo.
  unitCost = avgCost hiện tại (giá trị xuất). Audit `stock.issue`.
- `POST /inventory/stock/adjust` — { branchId, ingredientId, newQtyBase, note } — điều chỉnh
  kiểm kê: movement ADJUST = (newQty − oldQty), set balance = newQty. Audit `stock.adjust`.

## Frontend
- `stock-page.tsx`: bảng tồn (tên, tồn, ĐVT, giá vốn TB, giá trị, cờ tồn thấp) + filter
  lowOnly + drawer: lịch sử chuyển động + nút Xuất / Điều chỉnh (dialog qty + lý do).

## Tests
- e2e: issue giảm tồn đúng + chặn/âm theo Q1; adjust đặt tồn + movement delta đúng; low-stock
  cờ đúng; movements liệt kê; balance == Σ movements (bất biến); branch-scope; role gate.

## Risks
- issue/adjust re-read balance trong tx (chống đua). Giá trị tồn = qty×avgCost qua roundVnd.
