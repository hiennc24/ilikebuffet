---
phase: 3
title: "Auth RBAC & Branch-Scoping"
status: done
priority: P1
dependencies: [2]
completed: "2026-08-01"
---

# Phase 3: Auth RBAC & Branch-Scoping

## Overview
Spine bảo mật: đăng nhập, 6 vai trò cố định, **phân quyền lọc theo CN ở tầng server** (cross-branch → 403), PIN duyệt & PIN đăng nhập quầy. (NT-02, NT-04)

## Requirements
- Functional: JWT access ngắn + refresh; 6 role (`Quản trị HQ, Chủ chuỗi, Kế toán chuỗi, Quản lý CN, Thu ngân, Thủ kho`); user thuộc 1..n CN; PIN duyệt 6 số (QL), PIN đăng nhập quầy (thu ngân, khác PIN duyệt).
- Non-functional: khóa tài khoản có hiệu lực ≤30s; mật khẩu ≥8, đổi lần đầu, khóa 15' sau 5 sai; PIN lưu **argon2**, không hiển thị lại.

## Architecture
- `auth` module: password (argon2), JWT (access ~5–10', refresh + revocation list ở Redis → khóa ≤30s), đổi vai trò/CN hiệu lực ở refresh.
- **`BranchScopeGuard` + `@BranchScoped()`**: đọc danh sách CN của user từ token, ép mọi query/mutation filter theo CN; truy cập ngoài phạm vi → **403 + audit `cross_branch_denied`** (nối GA-01.1). Không endpoint nào tự nhớ — cấm truy vấn không qua repository có scope.
- Thiết bị quầy: đăng ký `device_id` cục bộ gắn 1 CN; màn khóa chọn thu ngân → PIN → vào ca; PIN sai 5 → khóa 15'. PIN hash cache client cho duyệt offline (dùng ở P8).
- 6 role = enum cố định (MVP không custom role); ma trận quyền theo bảng NT-02.2.

## Related Code Files
- Create: `apps/api/src/auth/` (login, jwt strategy, refresh, revocation), `apps/api/src/platform/rbac/` (roles, permissions matrix, `branch-scope.guard.ts`, `branch-scoped.decorator.ts`), `apps/api/src/platform/devices/`
- Modify: `audit` (thêm action cross_branch_denied, login_failed)
- Delete: —

## TDD Steps (test-first)
1. **RED**: `branch-scope.e2e-spec.ts` — Thu ngân CN01 gọi API của CN02 (kể cả sửa request thủ công) → **403 + audit row**. Chạy cho mọi endpoint có `@BranchScoped` (test tham số hoá).
2. **GREEN**: guard + repository scope helper.
3. **RED**: khóa tài khoản → phiên hiện tại mất hiệu lực ≤30s (revocation list).
4. **GREEN**: refresh + revocation.
5. **RED**: PIN — khóa sau 5 sai; hash argon2 không lộ; PIN duyệt ≠ PIN quầy.
6. **GREEN** + **REFACTOR**: permission matrix table-driven test (mỗi role × chức năng theo NT-02.2).

## Success Criteria
- [x] Cross-branch → 403 + log — `BranchScopeGuard` global; branchId present & không thuộc CN → 403 + audit `cross_branch_denied`. [~] "phủ MỌI endpoint scoped": guard gắn `req.branchScope` mọi request; keyless route dựa `BranchScopeHelper.requireScope()` (throw nếu bypass) — **enforcement repo-level (CI/lint) chốt ở P4** khi có data-repo layer (C1 fix, ghi rõ).
- [x] Khóa tài khoản hiệu lực ≤30s — per-request `tv` check qua Redis (invalidate-on-bump, TTL≤20s, Redis-read-error → DB fallback); token bị từ chối tức thì. Test revocation.
- [x] Ma trận 6 role đúng NT-02.2 — table-driven `permissions.spec.ts` (6 role × capabilities).
- [x] PIN đúng chuẩn — argon2; khóa 5 sai/15'; cashierPin ≠ approvalPin (cột tách biệt, test); device registry server-side + secret (H4); pin-login generic error + audit; account-lock chặn cả PIN-login.

## Risk Assessment
- Guard sót endpoint = lỗ hổng chéo CN. Mitigation: **default-deny** — request tới resource có branch mà thiếu scope context → 403; lint/test bắt controller thiếu decorator.

## Red Team Hardening (2026-07-31)
- **H2 (fail-closed thật)** — thay opt-in `@BranchScoped` bằng **global guard áp mọi route mặc định**; muốn bỏ scope phải `@Unscoped()`/`@Public()` **được audit + review**; CI liệt kê danh sách opt-out (ngắn) thay vì cố liệt kê mọi endpoint cần scope. Route chạm branch mà thiếu cả 2 annotation → **fail 403 lúc runtime**, không chỉ CI. Test: route mới quên annotation → 403 (không rò data).
- **H4 (device registry server-side)** — `device_id` không được là giá trị client-local tự khai. Server có **registry**: PIN quick-login yêu cầu **secret per-device do HQ/QL cấp lúc đăng ký** (non-exportable nếu được), server từ chối PIN-login cho device_id ngoài registry. Test: "PIN login từ device chưa đăng ký → 403 + full login" (NT-04.4).
- **M4 (revocation ≤30s thật)** — access token 5–10' mâu thuẫn ≤30s nếu chỉ check revocation lúc refresh. Chọn: **check revocation list mỗi request** HOẶC TTL access ≤30s. Test bắt buộc: "access token của account vừa khóa bị từ chối trong 30s" (không chỉ refresh fail).
- **C3/SC2 (bỏ PIN hash cache khỏi P3)** — P3 chỉ làm **quick-PIN online** (device reg, lock screen, argon2, lockout). Cơ chế cache hash PIN cho duyệt offline **chuyển hẳn sang P8** (nơi có consumer + test 6 kịch bản), tránh dead code 3 sprint drift contract.
- **C1 (sync cũng scoped)** — ghi rõ: sync controller (P8) chạy dưới global branch guard này; không có ngoại lệ batch-write.

<!-- Updated: Validation Session 1 — V2: chốt check revocation MỖI REQUEST + Redis (không phải chỉ refresh). Redis ở lại M1 (chỉ revocation). Test: access token của account vừa khóa bị từ chối trong ≤30s. -->
- **V2 (revocation ≤30s)** — **check revocation list Redis mỗi request** (không chỉ refresh); access token có thể giữ dài. Redis giữ ở M1 chỉ cho mục đích này.

### Implemented (169 api tests green) + post-review security fixes
- Global `JwtAuthGuard` + `BranchScopeGuard` (APP_GUARD, fail-closed default); opt-out `@Public()`/`@Unscoped()`; `@PasswordChangeAllowed()`.
- JWT access+refresh (secrets tách biệt, `typ` claim), argon2 password/PIN, device registry (secret argon2, server-issued id).
- **Code-review (DONE_WITH_CONCERNS) → 10 findings fixed + tested:** C1 branchScope attach + `requireScope()` throw (repo-enforcement→P4); C2 `mustChangePassword` gate; H1 revocation invalidate-on-bump + DB fallback (no fail-open); H2 real dummy argon2 hash (no enum timing oracle); H3 atomic lockout increment; M1 role-gated PIN setters; M2 generic pin-login error + audit; M3 `DeviceStatus` enum; M4 account-lock blocks pin-login; L10 token `typ` + TTL boot-validation.
- **Carry-forward:** repo-level branch-filter enforcement (CI/lint) for keyless scoped routes → **P4** (no data-repo yet). Holiday-calendar entity (M2 plan) → P4.
