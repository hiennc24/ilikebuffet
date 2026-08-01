# P3 — Master-data screens

**Goal:** UI cho nguyên liệu, nhóm, nhà cung cấp, tài khoản, lịch lễ. Backend đủ.

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
