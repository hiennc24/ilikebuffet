# P4 — Người dùng, vai trò & thiết bị (backend gap — lớn nhất)

**Goal:** quản lý user (6 vai trò), gán chi nhánh, reset mật khẩu/PIN, khoá/mở; quản lý
thiết bị POS. Backend hầu như CHƯA có (chỉ auth self-service + device register/suspend).

## Backend (new module `platform/users`)
Controller `users.controller` + `users.service` (RBAC đã chốt: `QUAN_TRI_HQ` toàn
quyền; `QUAN_LY_CN` tạo/quản user **trong chi nhánh mình**, không nâng quyền vượt vai
trò của chính actor):
- `GET /users` — list (filter role/branch/status, phân trang, `{data,total}`). KHÔNG
  trả hash mật khẩu/PIN (đã có bài học GA-01: response không lộ hash).
- `POST /users` — tạo (username, họ tên, role, branchIds). Sinh mật khẩu tạm →
  `mustChangePassword=true`; trả mật khẩu tạm **một lần** (không lưu plaintext).
- `PUT /users/:id` — sửa họ tên/role/branch (không đổi mật khẩu ở đây).
- `POST /users/:id/reset-password` — sinh mật khẩu tạm mới + buộc đổi.
- `POST /users/:id/reset-approval-pin` / `reset-cashier-pin` — xoá PIN (buộc set lại).
- `POST /users/:id/lock` / `unlock` — khoá/mở (dùng `pinLockedUntil`/status hiện có).
- Tất cả **audit GA-01** (in-tx), branch-scope fail-closed, không tự nâng quyền
  (insider-resistant: không cho tạo/nâng user vượt vai trò của chính actor).

Devices: thêm `GET /devices?branchId=` (list) vào `device.controller` (đang thiếu `@Get`).

## Frontend
- `users-page.tsx`: list (họ tên, username, role, chi nhánh, trạng thái, khoá) + tạo/sửa
  dialog + reset mật khẩu (hiện mật khẩu tạm 1 lần, nút copy) + reset PIN + khoá/mở.
- `devices-page.tsx`: list thiết bị theo chi nhánh + suspend + xem lần sync cuối.
- Chọn vai trò từ enum cố định (role.enum) — không nhập tự do.

## Files
- create `apps/api/src/platform/users/{users.module,controller,service,dto}.ts` (+ spec)
- modify `apps/api/src/platform/devices/device.controller.ts` (+ service list)
- modify `app.module.ts` (register users module)
- create `apps/api/test/users-admin.e2e-spec.ts`
- create `apps/admin/src/pages/users-page.tsx`, `devices-page.tsx` (+ tests)

## Steps (TDD)
1. e2e/red: create user (temp pw + mustChange), list hides hashes, reset pw/PIN, lock/unlock,
   branch-scope denial, actor cannot create above own role.
2. Implement users module (reuse AuthService password/PIN hashing helpers — DRY, không
   viết lại argon2 flow).
3. Device list endpoint + test.
4. FE users + devices pages.

## Tests
- e2e: full user lifecycle + insider-resistance (no privilege escalation, no hash leak).
- FE: create shows one-time temp pw; reset flows; lock disables login (assert call).

## Risks
- **Bảo mật cao:** không lộ hash; mật khẩu tạm chỉ trả 1 lần; audit mọi thao tác;
  chặn nâng quyền chéo. Reuse hashing/counters của AuthService, đừng nhân bản.
- RBAC đã chốt (HQ toàn quyền; QL_CN trong CN; không nâng quyền vượt vai trò actor) —
  test bảng ma trận để chống lệch giữa 3 lớp nav/route/API.
