# X0 — Chain overview (BI hợp nhất)

**Goal:** dashboard chuỗi per-branch + tổng + xếp hạng cho chain-wide roles.

## Backend (`sales/reports/reports.service` — thêm `chainOverview`)
- `GET /sales/reports/chain-overview?from&to` — role chain-level
  (QUAN_TRI_HQ/CHU_CHUOI/KE_TOAN_CHUOI). Branch role → 403 (đây là góc nhìn chuỗi).
- Per-branch rows (join branch code/name): netRevenueVnd (Σ COMPLETED − refunds),
  billCount, guestCount, cashVarianceVnd (Σ shift variance CLOSED), lowStockCount
  (từ InventoryBalance qty < defaultMinStock). Tổng chuỗi + xếp hạng theo net.
- Tái dùng branchWhere/dateWhere; gộp bằng Map theo branchId; 1-2 query gọn
  (bills theo businessDate, shifts CLOSED, inventory low-stock count).

## Frontend (`chain-dashboard-page.tsx`)
- Chỉ hiện cho chain-wide (rbac); KPI tổng chuỗi (doanh thu/khách/số bill/chênh
  lệch) + bảng per-branch (sắp theo doanh thu, cờ chênh lệch/tồn thấp).
- Route `/reports/chain`, nav dưới "Báo cáo & Đối soát", query-keys.

## Tests
- e2e: 2 CN có bill/ca → per-branch đúng + tổng + xếp hạng; branch role 403.
- FE: render KPI + bảng từ mock; ẩn với role không chain-wide.

## Risks
- Hiệu năng: gộp in-memory theo branch ở quy mô pilot; index sẵn có.
