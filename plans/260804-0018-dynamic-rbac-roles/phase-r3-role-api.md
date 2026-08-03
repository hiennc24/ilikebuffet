# R3 — Role CRUD API + catalog endpoint

**Goal:** API quản lý vai trò động + trả catalog quyền (nhóm + nhãn VN).

## RoleService (`platform/rbac/role.service.ts`)
- `listRoles()` → role + capabilities + userCount.
- `createRole({code,name,description,capabilities})` — validate code unique + kebab/UPPER,
  capabilities ⊆ ALL_CAPABILITIES; tạo role + role_capability; audit.
- `updateRole(code, {name,description})`; `setCapabilities(code, caps[])` — validate ⊆ catalog;
  thay toàn bộ role_capability trong tx; `perms.invalidate(code)`; audit.
- `deleteRole(code)` — chặn nếu có AppUser.role=code (đếm) → 409; chặn xoá vai trò cuối
  cùng còn `chain:user:manage` (tránh tự khoá quản trị); audit.
- Safety: khi setCapabilities, nếu là vai trò DUY NHẤT còn `chain:user:manage` và bỏ cap đó → 409.

## RbacController (mở rộng)
- GET `/rbac/capabilities` → đổi sang trả CATALOG (groups + VN labels) thay vì ma trận thô.
- GET `/rbac/roles`, POST `/rbac/roles`, PUT `/rbac/roles/:code`,
  PUT `/rbac/roles/:code/capabilities`, DELETE `/rbac/roles/:code`.
- Gate tất cả bằng `await perms.can(role, "chain:user:manage")` (quyền quản trị người dùng/vai trò).
- DTO class (value-import!) với class-validator; branch-scope không cần (dữ liệu chuỗi).

## Tests (`test/rbac-roles.e2e-spec.ts`)
- create/list/update/setCapabilities/delete; xoá role có user → 409; bỏ cap quản trị
  cuối cùng → 409; role thường (không quyền) → 403; capability ngoài catalog → 400.

## Verify
- e2e xanh; catalog trả đúng nhóm + nhãn VN.
