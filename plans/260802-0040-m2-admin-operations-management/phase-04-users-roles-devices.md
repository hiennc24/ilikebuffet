# P4 — Người dùng, vai trò & thiết bị (backend gap — lớn nhất)  ◑ PARTIAL (2026-08-02)

## Đã làm (P4 — Users)
- **BE module `platform/users`**: `GET/POST /users`, `PUT /users/:id`,
  `POST /users/:id/{reset-password,reset-approval-pin,reset-cashier-pin,lock,unlock}`.
  Insider-resistant: HQ toàn quyền; QL_CN chỉ quản THU_NGAN/THU_KHO trong CN mình;
  không lộ hash (SAFE_SELECT); mật khẩu tạm sinh 1 lần + mustChangePassword; lock bump
  tokenVersion (thu hồi session); audit mọi mutation in-tx. Reuse argon2.
- **e2e `users-admin.e2e-spec`** (7): tạo+login+mustChange, no-hash-leak (list+create),
  QL_CN không mint manager (403), QL_CN không đụng CN khác (403), cashier bị chặn (403),
  reset-password ra temp mới, lock/unlock.
- **FE `users-page.tsx`**: list (role/status/search + phân trang) + tạo (username/role/
  branch checkboxes, hiện temp password 1 lần) + drawer (reset mật khẩu/PIN, khoá/mở).
  Route `/settings/users`. Admin 55.

## Còn lại (P4b)
- **Devices**: `GET /devices?branchId=` (thêm vào device.controller — đang thiếu `@Get`) +
  `devices-page` (list thiết bị + suspend + xem sync cuối).

---
Original plan below.


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
