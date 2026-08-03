# R0 — Capability catalog + schema

**Goal:** Nền tảng dữ liệu: catalog capability (nhãn VN + nhóm) + bảng role/role_capability + đổi AppUser.role.

## Capability catalog (`platform/rbac/capability-catalog.ts`)
- Giữ `Capability` union hiện có (permissions.ts) làm nguồn sự thật cho enforcement.
- Thêm `CAPABILITY_CATALOG: CapabilityGroup[]` với: `{ key, label(VN), capabilities: [{ key: Capability, label(VN) }] }`.
- Nhóm dự kiến (feature→actions): Cấu hình chuỗi (chain:*), Tổng quan/Báo cáo
  (dashboard/report), Ca & Bán hàng (shift/discount/bill), Tài chính (cash:*),
  Kho & Mua hàng (inventory/purchase-order). Nhãn VN cho từng capability.
- Export `ALL_CAPABILITIES: Capability[]` (union phẳng) để validate role_capability.

## Schema (`prisma/schema.prisma`)
- `model Role { id, code String @unique, name String, description String?, isSystem Boolean @default(false), createdAt; capabilities RoleCapability[]; @@map("role") }`
- `model RoleCapability { roleId String, capability String, role Role @relation(...); @@id([roleId, capability]); @@map("role_capability") }`
- `AppUser.role`: đổi từ enum `Role` → `String`. Giữ giá trị (mã trùng enum). Thêm
  index nếu cần. (KHÔNG thêm FK cứng AppUser.role→Role.code để tránh phức tạp migrate
  thứ tự; ràng buộc mềm ở service — nhưng chặn xoá role còn user ở R3.)

## Migration `prisma/migrations/<ts>_dynamic_rbac/migration.sql`
- Tạo bảng role, role_capability (FK role_capability.roleId→role RESTRICT).
- Đổi cột app_user.role: enum → text (USING role::text) giữ giá trị.
- Seed 6 role hệ thống (code=enum values, name=ROLE_LABELS, isSystem=true) + seed
  role_capability từ ROLE_CAPABILITIES hiện tại.
- (Enum Role của Postgres giữ lại tạm — không drop để tránh phụ thuộc; hoặc drop nếu
  không còn cột dùng. Quyết định lúc viết: drop type "Role" sau khi đổi cột.)
- Apply từ ROOT: prisma migrate deploy + generate.

## Verify
- prisma generate; tsc; seed đúng 6 role + capabilities khớp ROLE_CAPABILITIES
  (spec so khớp catalog ⊇ union).
