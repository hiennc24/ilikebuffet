---
title: "Responsive / mobile — admin SPA + POS PWA (mobile-first)"
slug: responsive-mobile
created: 2026-08-04
status: in-progress
priority: P1

context: |
  Admin cố tình desktop-only (DECISION #8): shell minWidth 1440, index.html
  viewport width=1440 (chặn mobile), style inline (không @media), sidebar 248px cố
  định. POS đã mobile-first. User yêu cầu: mobile-first redesign CẢ HAI app,
  breakpoints 375/768/1024/1440.

decisions:
  - Đảo DECISION #8 cho admin (user chủ động yêu cầu responsive).
  - Làm responsive TẬP TRUNG ở shell + shared primitives (DataTable, Dialog,
    FilterBar) để mọi trang hưởng lợi (DRY), thay vì sửa tay từng trang.
  - Style inline → thêm hook useMediaQuery + style theo breakpoint. Breakpoints:
    phone <768, tablet 768–1023, desktop ≥1024 (sidebar cố định ≥1024, drawer <1024).
  - Bottom nav cho mobile: cân nhắc; ưu tiên drawer (nav admin >5 mục). POS: bottom nav.

## Phases

| Phase | Tên | Nội dung | Status |
|-------|-----|----------|--------|
| A | Admin shell responsive | index.html viewport=device-width; useMediaQuery hook; AdminShell: bỏ minWidth 1440; <1024 sidebar → drawer trượt + hamburger + scrim; content fluid + safe gutters | done |
| B | Admin shared primitives | DataTable cuộn ngang (mobile) / card mode; Dialog full-width→bottom-sheet mobile; FilterBar xếp dọc; form full-width. Ở _shared/admin-ui → toàn app hưởng | done |
| C | Admin page passes | rà các trang nặng (bảng rộng, dialog phức tạp); tối ưu spacing/hierarchy mobile | planned |
| D | POS responsive audit | POS đã mobile-first; rà gap responsive (sell, pay, shift) + bottom nav chuẩn 44pt | planned |
| E | Verify + docs | test 375/768/1024/1440; reduced-motion; design-guidelines cập nhật; report | planned |

## Acceptance
- Không horizontal-scroll ngoài ý muốn ở 375px; viewport=device-width (cho zoom).
- Touch target ≥44px; nav dùng được 1 tay trên phone.
- Admin: <1024 drawer nav + content fluid; ≥1024 giữ layout desktop hiện tại.
- Bảng: cuộn ngang gọn trong container (không tràn trang) trên mobile.
- Tests admin/pos hiện có xanh; build xanh.

## Out of scope (đợt này)
- Redesign card cho MỌI bảng (làm dần ở C); ưu tiên shell + primitives dùng được.
