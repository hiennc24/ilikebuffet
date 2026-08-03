---
title: "Dynamic RBAC — DB-backed roles CRUD + capability catalog (VN labels, grouped)"
slug: dynamic-rbac-roles
created: 2026-08-04
status: in-progress
priority: P1

context: |
  Hiện: AppUser.role = enum cứng (6 vai trò), 17 capability là union code trong
  permissions.ts, chỉ 2 endpoint dùng can(), 15 endpoint gate bằng Set<Role> cứng.
  Màn /settings/permissions read-only, hiển thị capability thô (branch:dashboard:read).

decisions:
  - roles: DB-backed. Bảng role(code unique, name, description?, isSystem) +
    role_capability(roleId, capability). Seed 6 vai trò hiện có (isSystem=true) +
    tập capability hiện tại. AppUser.role: enum → String (giá trị = role.code, giữ
    nguyên dữ liệu). CRUD vai trò mới; vai trò hệ thống sửa/xoá được như master data
    NHƯNG chặn xoá khi còn user tham chiếu (RESTRICT) — an toàn tối thiểu.
  - effect: hiệu lực NGAY. JWT vẫn mang role (code); guard tra capabilities từ DB
    qua cache in-memory (invalidate khi sửa role/role_capability + TTL ngắn).
  - capabilities: VẪN là catalog cố định trong code (vì code mới enforce được) —
    nhưng thêm nhãn tiếng Việt + nhóm (group) + phân cấp (feature→actions). Role
    (DB) chọn từ catalog này. role_capability chỉ nhận capability hợp lệ trong catalog.
  - enforcement: migrate HẾT 15 gate role-cứng sang can(role, capability); seed các
    capability cần thiết cho vai trò hệ thống để GIỮ NGUYÊN hành vi hiện tại.

## Phases

| Phase | Tên | Nội dung | Phụ thuộc | Status |
|-------|-----|----------|-----------|--------|
| R0 | [Catalog + schema](./phase-r0-catalog-schema.md) | capability catalog (VN label+group) + Prisma role/role_capability + AppUser.role enum→String + migration seed | — | planned |
| R1 | [Resolver + can()](./phase-r1-resolver.md) | PermissionService tra capabilities theo role từ DB + cache (invalidatable); can() đọc cache; wire vào guard/2 site hiện có | R0 | planned |
| R2 | [Migrate 15 gates](./phase-r2-migrate-gates.md) | thay 15 Set<Role> → can(role, capability); thêm capability mới vào catalog + seed cho vai trò hệ thống; giữ nguyên hành vi (test cũ xanh) | R1 | planned |
| R3 | [Role CRUD API](./phase-r3-role-api.md) | RbacController: GET catalog (nhóm+VN), GET/POST/PUT/DELETE roles, PUT roles/:code/capabilities; gate bằng role:manage; chặn xoá khi có user; e2e | R1 | planned |
| R4 | [Admin UI](./phase-r4-admin-ui.md) | màn Vai trò & phân quyền: list + CRUD role + chọn quyền theo nhóm (checkbox, nhãn VN, phân cấp); users page dùng role từ DB; tests | R3 | planned |
| R5 | [Docs + verify](./phase-r5-docs-verify.md) | docs (system-architecture RBAC động) + full verify (API --runInBand, admin) + report | R0-R4 | planned |

## Acceptance
- Tạo/sửa/xoá vai trò (DB); gán tập capability; xoá bị chặn khi còn user tham chiếu.
- Sửa quyền vai trò → hiệu lực ngay (guard tra DB+cache).
- Màn phân quyền hiển thị nhãn tiếng Việt theo nhóm + phân cấp feature→actions.
- 6 vai trò hệ thống + hành vi 17+ endpoint GIỮ NGUYÊN (mọi test hiện có xanh).
- Vai trò custom có tác dụng ở MỌI endpoint (đã migrate sang capability).

## Risks / rollback
- **Auth blast radius**: đổi AppUser.role enum→String + guard tra DB. Migration
  additive + backfill giữ giá trị. Cache sai → tra thẳng DB fallback.
- **Tự khoá quyền**: chặn xoá role còn user; luôn giữ ≥1 vai trò có role:manage
  (kiểm tra khi lưu capabilities của vai trò cuối cùng có role:manage).
- Mỗi phase commit riêng; test hiện có là lưới an toàn (behavior-preserving).

## Out of scope
- Tạo capability MỚI qua UI (capability do code enforce; chỉ chọn từ catalog).
- Per-branch role assignment nâng cao (giữ mô hình chainWide/branchIds hiện tại).
