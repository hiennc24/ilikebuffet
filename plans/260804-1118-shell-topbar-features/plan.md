---
title: "Admin shell topbar — login info, notifications, command-palette search, dark mode"
slug: shell-topbar-features
created: 2026-08-04
status: in-progress
priority: P1

context: |
  Admin topbar (56px) chỉ có pageTitle + topbarActions + ☰ mobile; bên phải trống.
  Auth context expose `role` nhưng KHÔNG có username (JWT có). Không có dark-mode
  token (tokens.css chỉ light). Không có noti/search.

decisions:
  - search: command palette (Cmd+K) lọc nav item + nhảy tới; không backend.
  - noti: khung UI (chuông + dropdown empty state), chưa nối dữ liệu.
  - dark mode: FULL theme — [data-theme="dark"] override toàn bộ color token +
    toggle + lưu localStorage (khởi tạo theo prefers-color-scheme).
  - login info: menu người dùng ở góc phải topbar (username + vai trò + chi nhánh
    + đăng xuất). Username lấy từ JWT (thêm vào auth context).

## Phases

| Phase | Tên | Nội dung | Status |
|-------|-----|----------|--------|
| P1 | Topbar right cluster + username | thêm username vào auth-context (decode JWT); topbar phải chứa cụm action (search/noti/theme/user) responsive | done |
| P2 | User menu (login info) | nút avatar/tên → menu: username + vai trò + chi nhánh hiện tại + Đăng xuất | done |
| P3 | Command palette search | nút Search + Cmd+K → palette lọc nav (rbac-filtered) + Enter/click điều hướng | done |
| P4 | Notifications shell | chuông + dropdown empty state ("Chưa có thông báo"); badge count (0) | done |
| P5 | Dark mode | dark token set trong tokens.css ([data-theme=dark]); theme context/hook (persist + prefers-color-scheme); toggle topbar; set data-theme trên <html> | done |
| P6 | Verify + docs | tests (menu/palette/theme toggle), full admin suite, build; docs design-guidelines | done |

## Acceptance
- Topbar phải: search, chuông, toggle sáng/tối, menu người dùng — gọn trên desktop,
  thu gọn hợp lý trên mobile.
- Cmd+K mở palette; gõ lọc nav; Enter điều hướng; Esc đóng.
- Toggle dark: đổi [data-theme], lưu, tải lại giữ nguyên; contrast đạt (text ≥4.5:1).
- Menu người dùng hiển thị đúng username + vai trò + chi nhánh; Đăng xuất hoạt động.
- Tests admin xanh; build xanh; không phá màn hiện có.

## Out of scope
- Backend search/noti data (noti là khung UI). Dark mode cho POS (đợt sau nếu cần).
