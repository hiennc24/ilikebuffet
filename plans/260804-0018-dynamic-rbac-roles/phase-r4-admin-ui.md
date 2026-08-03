# R4 — Admin UI: quản lý vai trò & phân quyền

**Goal:** Màn Vai trò & phân quyền: CRUD vai trò + chọn quyền theo nhóm (nhãn VN, phân cấp).

## permissions-page → roles-page (`apps/admin/src/pages/permissions-page.tsx`)
- Trái: danh sách vai trò (tên VN, badge "Hệ thống"/"Tuỳ chỉnh", số user). Nút "Vai trò mới".
- Phải/drawer: form vai trò — mã (custom), tên, mô tả; **cây quyền theo nhóm**:
  mỗi nhóm (feature) là 1 section có tiêu đề VN + checkbox toàn nhóm; các action con là
  checkbox nhãn VN (không hiển thị `branch:dashboard:read` thô). Phân cấp: chọn/bỏ nhóm
  → toggle các action con.
- Lưu → PUT capabilities; tạo → POST; xoá → DELETE (confirm; disable nếu có user).
- Fetch catalog từ GET /rbac/capabilities (groups) + GET /rbac/roles.

## Users page (`apps/admin/src/pages/users-page.tsx`)
- Dropdown vai trò: lấy từ GET /rbac/roles (thay ROLE_LABEL cứng) — hỗ trợ vai trò custom.
- Giữ ROLE_LABEL fallback cho hiển thị.

## Wiring
- query-keys: `roles`, giữ `rbacCapabilities`. Route `/settings/permissions` giữ nguyên.
- rbac.ts client: gate màn bằng vai trò có quyền quản trị (giữ {QUAN_TRI_HQ, QUAN_LY_CN}
  hoặc theo capability nếu client biết — đơn giản giữ set hiện tại).

## Tests
- roles-page test: render nhóm + nhãn VN; tạo vai trò gọi POST; toggle nhóm chọn hết
  action con; lưu gọi PUT capabilities.
- users-page test: dropdown vai trò lấy từ /rbac/roles.

## Verify
- admin vitest (suite liên quan) + tsc + eslint + build.
