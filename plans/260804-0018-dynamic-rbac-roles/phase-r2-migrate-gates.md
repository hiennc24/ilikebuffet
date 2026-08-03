# R2 — Migrate 15 gate role-cứng sang capability

**Goal:** Mọi endpoint gate bằng capability → vai trò custom có tác dụng khắp nơi; hành vi hệ thống giữ nguyên.

## Map role-set → capability mới (thêm vào catalog + seed cho role hệ thống)
Cho mỗi `new Set<Role>()` hiện có, định nghĩa 1 capability + seed đúng các vai trò
đang có trong set (để hành vi không đổi):
- reports.controller REPORT_VIEW_ROLES → `report:view`; CHAIN_REPORT_ROLES → `report:chain-view`.
- audit.controller AUDIT_VIEW_ROLES → `audit:view`.
- users.controller USER_ADMIN_ROLES → `chain:user:manage` (đã có) — dùng lại.
- device.controller → `device:manage`.
- inventory-roles INVENTORY_WRITE/VIEW → `inventory:manage`/`inventory:read` (đã có) hoặc thêm.
- transfers/recipes/bills/bank-transactions controllers → capability tương ứng
  (`inventory:transfer`, `recipe:manage`, `bill:*`, `bank:reconcile`…). Liệt kê khi làm.

## Thực hiện
- Thêm capability mới vào `Capability` union + CAPABILITY_CATALOG (nhãn VN, đúng nhóm).
- Thay mỗi controller: bỏ Set<Role> + kiểm tra membership → `await perms.can(role, cap)`
  (giữ ForbiddenException + thông điệp). Controller method async hoá nếu cần.
- Cập nhật seed R0/migration + `ROLE_CAPABILITIES` để 6 vai trò hệ thống nhận đúng
  capability mới KHỚP các Set cũ (behavior-preserving) — thêm migration bổ sung seed.
- permissions.spec cập nhật ma trận cho capability mới.

## Verify
- CHẠY LẠI toàn bộ e2e rbac/endpoint cũ (inventory-rbac, audit, reports, bills…):
  mọi allow/deny GIỮ NGUYÊN. Đây là bước rủi ro nhất — test cũ là lưới an toàn.
