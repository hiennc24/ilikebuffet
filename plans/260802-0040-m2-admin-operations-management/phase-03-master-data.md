# P3 — Master-data screens  ◑ PARTIAL (2026-08-02)

**Goal:** UI cho nguyên liệu, nhóm, nhà cung cấp, tài khoản, lịch lễ. Backend đủ.

## Đã làm (P3)
- **Nhà cung cấp** (`suppliers-page.tsx`): list (search + status) + tạo (scope
  CHAIN_WIDE/BRANCH_SPECIFIC) + sửa + **duyệt HQ** (PENDING_HQ → approve). Route
  `/master-data/suppliers` + nav "Nhà cung cấp". Tests (3). Admin 52.

## Đã làm (P3b — Holidays) ✅ 2026-08-02
- **Lịch lễ** (`holidays-page.tsx`): list calendar (năm/tên/phạm vi/số ngày) + tạo lịch
  (năm, tên) + editor entries (thêm/xoá ngày+tên, replace-on-save PUT). HQ-only (BE +
  RBAC FE). Route `/master-data/holidays` + nav "Lịch lễ". Tests (2). Admin 68.

## Còn lại (P3c — form phức tạp/nested + file upload)
- **Nguyên liệu** (+ nhóm + đơn vị + purchase-units ≤3 nested) — cần group+unit selects.
- **Tài khoản** (+ nhóm tài khoản).
- **Đơn vị** (units).
- **Import Excel** (`POST /import/ingredients`) — multipart + endpoint stream error-workbook
  khi có lỗi (cần xử lý blob ở FE).

## Backend (done — master-data.controller)
- Ingredients: `GET`, `GET /groups`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`
  (deactivate nếu đã phát sinh — NT-03.2), purchase-units (≤3), nhóm CRUD.
- Suppliers: `GET`, `POST`, `PUT /:id`, `DELETE /:id`, `PATCH /:supplierId/approve`.
- Accounts (kế toán): `GET`, `POST`, `PUT /:accountId`.
- Holidays calendar: `GET`, `PUT /:calendarId/entries`.
- Import: `POST /import/ingredients` (Excel) — màn import **làm trong M2 (đã chốt)**.

## Frontend
Một trang gộp có tab, hoặc route con `/master-data/{ingredients,suppliers,accounts,holidays}`:
- **Nguyên liệu:** DataTable + dialog (tên, nhóm, đơn vị mua ≤3, trạng thái); xoá =
  deactivate khi đã phát sinh (hiện lý do). Nhóm: quản lý inline.
- **Nhà cung cấp:** list + tạo/sửa + **duyệt** (PATCH approve) — chỉ HQ duyệt.
- **Tài khoản:** list + tạo/sửa.
- **Lịch lễ:** calendar entries editor (ngày lễ → ảnh hưởng day-type HOLIDAY của giá).
- **Import Excel (đã chốt M2):** upload → preview (dùng import result) → confirm. Upload
  qua ApiClient (không raw fetch); hiển thị lỗi/dòng bị bỏ theo kết quả import.

## Files
- create `apps/admin/src/pages/master-data/{ingredients,suppliers,accounts,holidays}-page.tsx`
  (+ tests), route con trong app.tsx
- reuse P0 components

## Steps (TDD)
1. FE test mỗi tab: list + create/edit + hành động đặc thù (approve, deactivate reason,
   holiday entries).
2. Implement.

## Tests
- 1 test file/tab; approve chỉ HQ; deactivate hiển thị lý do; holiday entries lưu đúng.

## Risks
- Lịch lễ ↔ pricing day-type: đảm bảo entry lễ khớp cách resolver đọc `isHoliday`
  (kiểm tra `masterData.isHoliday`), không lệch định dạng ngày (VN date).
- Đơn vị mua ≤3: validate cả FE lẫn dựa lỗi BE (đã có), không nhân đôi rule sai lệch.
