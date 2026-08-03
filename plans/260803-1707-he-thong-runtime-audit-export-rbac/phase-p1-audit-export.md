# P1 — Xuất nhật ký (audit export)

**Goal:** Tải nhật ký (.xlsx) theo bộ lọc hiện tại từ màn Nhật ký.

## Backend (`apps/api/src/audit`)
- `audit.service.ts`: thêm `exportRows(filters, access)` — tái dùng logic của
  `query()` nhưng bỏ phân trang (lấy tối đa N, vd 10_000, orderBy id desc), cùng
  branch-scope. Trả mảng rows.
- `audit.controller.ts`: `@Get("export")` — cùng guard `AUDIT_VIEW_ROLES` +
  branch-scope như `list`; build ExcelJS (cột: thời gian, người thực hiện, vai trò,
  hành động, đối tượng, chi nhánh, IP/ghi chú nếu có) → gửi buffer với header xlsx.
  Route `export` phải đứng trước/không đụng `@Get()` list (khác path nên OK).

## Frontend (`apps/admin/src/pages/audit-page.tsx`)
- Thêm nút "Xuất Excel" (giống report pages) → `api.download('/audit/export?<filters>')`
  với đúng bộ lọc đang áp; tải file `nhat-ky-<from>-<to>.xlsx`.

## Tests
- API: `test/audit-export.e2e-spec.ts` — seed vài audit rows, gọi export → buffer
  bắt đầu "PK"; filter theo action/objectType lọc đúng số dòng; role không có quyền
  → 403; branch scope confine.
- FE: audit-page test — nút Xuất gọi download đúng URL kèm filter.

## Notes
- KHÔNG dùng `AuditExportService` (WORM off-box). Đây là export UI theo filter.
- Audit là append-only; chỉ đọc — không thêm route ghi.
