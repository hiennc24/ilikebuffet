---
title: "Hệ thống — sửa runtime API + xuất nhật ký + màn phân quyền"
slug: he-thong-runtime-audit-export-rbac
created: 2026-08-03
status: in-progress
priority: P1

context: |
  Ba màn Hệ thống (Chi nhánh / Người dùng-vai trò / Nhật ký) đã có sẵn end-to-end.
  Triệu chứng "API hầu như không hoạt động" đã chẩn đoán: KHÔNG phải lỗi code
  (556 API test + 111 admin test xanh; build mới phục vụ đủ route). Nguyên nhân:
    1. Tiến trình API đang chạy là build CŨ (trước E3/E4) → /sales/finance,
       /sales/reports/pnl, /sales/finance/payables/aging trả 404. Build mới (thử
       trên :3009) trả 401 (route có, có guard) → chỉ cần rebuild + restart.
    2. `start:prod` = `node dist/main.js` SAI đường dẫn (thật: dist/apps/api/src/main.js).
    3. `.env` PORT=3000 đụng app khác (biso24 web-builder) + lệch Vite proxy (→3001).

decisions:
  - runtime: PORT chuẩn = 3001 (khớp Vite proxy admin/POS). Sửa .env.example +
    .env local (không commit .env). Sửa start:prod đường dẫn. Restart từ build mới.
  - audit-export: thêm route GET /audit/export (xlsx, cùng filter + guard + branch
    scope như list). KHÔNG dùng AuditExportService (đó là WORM off-box, mục đích khác).
  - rbac-view: expose ROLE_CAPABILITIES read-only qua GET /rbac/capabilities; màn
    admin hiển thị ma trận capability × vai trò (không sửa; matrix vẫn ở code).
  - tests: chỉ gap-fill cho phần MỚI (audit export, rbac matrix). Không viết lại
    556+111 test đã có.
---

# Hệ thống — runtime fix + audit export + màn phân quyền

## Phases

| Phase | Tên | Nội dung | Phụ thuộc | Status |
|-------|-----|----------|-----------|--------|
| P0 | [Fix runtime API](./phase-p0-fix-runtime.md) | start:prod path + PORT=3001 (.env/.env.example) + rebuild + restart; verify /sales/finance 401 | — | planned |
| P1 | [Xuất nhật ký](./phase-p1-audit-export.md) | GET /audit/export (xlsx) + nút Xuất trên màn Nhật ký + e2e + FE test | — | planned |
| P2 | [Màn Vai trò & phân quyền](./phase-p2-rbac-matrix.md) | GET /rbac/capabilities + màn read-only ma trận + route/nav/rbac + tests | — | planned |
| P3 | [Rà soát + verify](./phase-p3-review-verify.md) | review 3 màn + full verify + docs + report | P0,P1,P2 | planned |

## Acceptance
- Sau P0: chạy `pnpm dev` (hoặc restart) → admin gọi API không còn 404 ở các màn
  mới; /sales/finance & /pnl & /aging trả 401 khi chưa đăng nhập (route có mặt).
- Xuất nhật ký: tải được .xlsx theo bộ lọc hiện tại; guard + branch-scope như list.
- Màn phân quyền: hiển thị đúng ma trận 6 vai trò × capability (khớp permissions.ts).
- Không phá test hiện có; tiền/định dạng không đổi; test API/admin xanh.

## Out of scope
- Sửa/biên tập ma trận capability qua UI (matrix vẫn hardcode ở code).
- Viết lại toàn bộ test đã có (đã xanh 556+111).
- WORM audit export off-box (đã có service riêng).
