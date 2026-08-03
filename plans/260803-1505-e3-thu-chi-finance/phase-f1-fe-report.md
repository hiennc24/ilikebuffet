# F1 — FE thu-chi + báo cáo chi phí

**Goal:** màn thu-chi (list + tạo + duyệt) + báo cáo chi phí theo tài khoản/kỳ.

## Backend
- Endpoint list đã ở F0. Thêm (tuỳ) `GET /sales/finance/summary?from&to&branchId` —
  gộp theo account (name, flow, Σamount) + tổng thu/chi/net. Branch-scoped, role-gated.

## Frontend (`finance-page.tsx`)
- List phiếu (usePagedList) + lọc flow/tài khoản/kỳ + KPI tổng thu/chi/net.
- Dialog tạo: chọn tài khoản (fetch /master-data/accounts), số tiền, phương thức,
  ngày, ghi chú, (tuỳ) NCC. Nếu vượt ngưỡng → hiện ô managerId + PIN.
- Route `/finance`, nav dưới "Quản lý" hoặc "Báo cáo", rbac (kế toán-chuỗi + HQ/chủ
  + QL_CN), query-keys.

## Tests
- e2e: summary gộp đúng theo account + totals.
- FE: render list + KPI; tạo phiếu gọi POST; luồng duyệt PIN hiện khi vượt ngưỡng.

## Risks
- Ngưỡng duyệt: FE tính threshold từ account đã chọn để hiện ô PIN (server vẫn là gate).
