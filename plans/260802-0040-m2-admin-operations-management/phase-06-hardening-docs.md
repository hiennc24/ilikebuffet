# P6 — RBAC-per-screen, hardening & docs

**Goal:** khoá quyền theo màn, đồng bộ trạng thái UI, e2e cross-cutting, cập nhật docs.
Chạy sau khi P1–P5 xong.

## RBAC per màn (6 vai trò)
- Định nghĩa ma trận màn ↔ vai trò (bảng trong docs). Ví dụ (chốt khi làm):
  - Đơn hàng: HQ + QL_CN (trong chi nhánh); Thu ngân không.
  - Chi nhánh, Người dùng: HQ only.
  - Master-data: HQ + role phụ trách; NCC approve = HQ.
  - Nhật ký: HQ (tất cả) + QL_CN (trong chi nhánh mình).
  - Hoàn tiền (Orders): role được huỷ/hoàn (HQ + QL_CN) — cần PIN quản lý.
- 3 lớp: (1) nav item ẩn nếu thiếu quyền; (2) route guard chặn + redirect; (3) API 403
  (đã fail-closed). Nav/route dùng một nguồn `can(role, screen)`.

## Hardening
- Mọi list: loading skeleton, empty state có hướng dẫn, error + retry, phân trang chuẩn.
- Branch selector (HQ) đồng bộ giữa các màn; QL_CN mặc định khoá về chi nhánh mình.
- i18n/text VN nhất quán; không lộ mã nội bộ ra UI (giữ chuẩn đã strip ở M1).
- Query-key invalidation đúng phạm vi (sửa 1 entity không repaint màn khác).

## Verify (cross-cutting)
- e2e: RBAC denial matrix cho các endpoint mới (Orders list, Users, Audit, Device list).
- FE: mỗi màn có test route-guard (role thiếu quyền → redirect).
- Chạy full: API unit+e2e, admin/pos/shared/ui build+test+lint xanh.

## Docs
- `docs/system-architecture.md`: thêm sơ đồ module admin + endpoint mới.
- `docs/project-roadmap.md` (tạo nếu chưa có): đánh dấu M2 done, liệt kê M3+ (Đối soát &
  Báo cáo, Kho, VietQR auto-reconcile).
- Cập nhật `README` phần màn hình admin.
- `docs/code-standards.md`: chốt pattern list-screen (DataTable + usePagedList) làm chuẩn.

## Risks
- Ma trận RBAC dễ sai lệch giữa 3 lớp → tập trung vào 1 hàm `can()` + test bảng.
- Đừng để hardening biến thành refactor tràn lan; giới hạn ở màn M2.
