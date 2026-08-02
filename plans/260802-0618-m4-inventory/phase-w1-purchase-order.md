# W1 — Đơn mua (Purchase Order)

**Goal:** tạo/quản lý đơn mua tới NCC theo chi nhánh.

## Backend
- `GET /inventory/purchase-orders?branchId&status&supplierId&q&page&pageSize` — list,
  branch-scoped, `{data,total}`.
- `GET /inventory/purchase-orders/:id` — detail (lines + supplier + branch).
- `POST /inventory/purchase-orders` — { branchId, supplierId, note?, lines:[{ingredientId,
  unitId, qty, unitPriceVnd}] }. lineTotalVnd = roundVnd(qty×unitPriceVnd); status DRAFT.
  Code gapless-ish per branch (hoặc cuid + số hiển thị). Branch-scope + role gate.
- `PUT /inventory/purchase-orders/:id` — sửa (chỉ DRAFT).
- `POST /inventory/purchase-orders/:id/send` — DRAFT→SENT (+ audit). (Q2: duyệt nếu chốt.)
- `POST /inventory/purchase-orders/:id/cancel` — →CANCELLED (chỉ DRAFT/SENT).
- Money: unitPriceVnd Int; qty Float; lineTotal/total = roundVnd. Audit mọi mutation.

## Frontend
- `purchase-orders-page.tsx`: list (lọc status/NCC/tìm) + tạo/sửa dialog (chọn NCC, thêm
  dòng: nguyên liệu + đơn vị + qty + đơn giá; tổng tự tính) + gửi/huỷ. Drawer chi tiết.

## Tests
- e2e: tạo PO (line totals đúng qua roundVnd), branch-scope denial, chỉ DRAFT sửa được,
  send/cancel chuyển trạng thái, cashier 403. FE: tạo + thêm dòng + tổng.

## Risks
- roundVnd(qty×price) nhất quán FE/BE (BE là nguồn). qty>0, price≥0 integer.
