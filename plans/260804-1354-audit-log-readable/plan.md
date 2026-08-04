---
title: "Nhật ký — nhãn tiếng Việt (action/đối tượng), tên người thực hiện, filter desktop"
slug: audit-log-readable
created: 2026-08-04
status: in-progress
priority: P2

context: |
  Màn Nhật ký hiện hiển thị KEY thô: action (role.create, user.reset_approval_pin…),
  objectType (role:STAFF, app_user:cms…), và Người thực hiện = actorId (cuid) + role.
  Backend audit query trả actorId + actorRole, KHÔNG có username. Filter desktop
  (5 field, flex 1 1 200px) xuống dòng 4+1 nhìn chưa cân.

decisions:
  - Action/objectType → nhãn tiếng Việt (map đầy đủ + fallback dễ đọc). Ví dụ user:
    role.create → "Tạo vai trò", role.delete → "Xoá vai trò", user.create → "Tạo tài khoản".
  - Người thực hiện → username (backend resolve actorId→app_user.username; thêm
    actorName vào AuditRecordView; FE hiện tên (fallback id) + nhãn vai trò VN).
  - Đối tượng → nhãn VN của objectType + id ngắn gọn (không resolve tên mọi entity —
    ngoài phạm vi; role/branch id vốn là mã đọc được).
  - Filter desktop → grid auto-fit minmax(180px,1fr): 5 field chia đều 1 hàng trên
    desktop, xuống 1 cột trên mobile.

## Phases

| Phase | Tên | Nội dung | Status |
|-------|-----|----------|--------|
| A1 | Backend actorName | audit.service.query resolve actorId→username (map query), thêm actorName vào AuditRecordView; e2e giữ xanh | planned |
| A2 | Nhãn VN | apps/admin/src/pages/_shared/audit-labels.ts: ACTION_LABELS + OBJECT_LABELS + ROLE_LABELS + describeAction/describeObject (fallback dễ đọc) | planned |
| A3 | Audit page + filter | audit-page dùng nhãn (action/đối tượng/người thực hiện=actorName) + đổi FilterBar sang grid auto-fit; tests | planned |
| A4 | Verify | tsc + audit e2e + admin vitest + build | planned |

## Acceptance
- Cột Hành động: text VN (role.create → "Tạo vai trò"); Đối tượng: nhãn VN;
  Người thực hiện: tên user (fallback id) + vai trò VN.
- Filter desktop: 5 field cân đối 1 hàng (grid), mobile 1 cột.
- Action lạ (chưa map) → fallback đọc được, không phải KEY thô nếu tránh được.
- API/admin tests xanh; build xanh.

## Out of scope
- Resolve tên cho MỌI objectId (chỉ nhãn loại + id ngắn). Trang khác.
