# R1 — Permission resolver + can() từ DB (hiệu lực ngay + cache)

**Goal:** Guard/can() lấy capabilities theo role từ DB, cache invalidatable.

## PermissionService (`platform/rbac/permission.service.ts`)
- `capsOf(roleCode): Promise<Set<Capability>>` — đọc role_capability từ DB.
- Cache in-memory: `Map<roleCode, Set<Capability>>` + TTL ngắn (vd 30s) + `invalidate(roleCode?)`
  gọi khi R3 sửa role/capabilities → hiệu lực ngay.
- `can(roleCode, capability): Promise<boolean>` (async) dùng cache; fallback query DB.
- Fallback an toàn: nếu DB lỗi/không có role → deny (fail-closed).

## Wire vào enforcement hiện có
- 2 site đang dùng `can()` đồng bộ (finance/PO controller): đổi sang async
  `await this.perms.can(...)` (controller method đã async). Inject PermissionService.
- Giữ `permissions.ts` ROLE_CAPABILITIES + `can()` cũ TẠM cho seed/spec, nhưng đánh dấu
  nguồn runtime là DB. (permissions.spec vẫn test catalog mặc định.)
- Module: đăng ký PermissionService trong RbacModule, export; import ở nơi cần.

## Tests
- permission.service.spec: seed role+caps trong DB test → capsOf/can đúng; cache
  invalidate phản ánh thay đổi; role không tồn tại → deny.

## Verify
- finance/PO e2e cũ xanh (hành vi không đổi vì DB seed = ROLE_CAPABILITIES).
