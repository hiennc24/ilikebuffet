---
title: "Chuyển chọn chi nhánh lên topbar + breadcrumb theo trang"
slug: topbar-branch-breadcrumb
created: 2026-08-04
status: done
priority: P2
---

context: |
  Sidebar đang chứa branch switcher (dưới brand); topbar hiện <h1>{pageTitle}</h1>
  lặp lại tiêu đề Card trong nội dung. User muốn: đưa branch switcher lên topbar
  (bỏ tiêu đề trang), và thêm breadcrumb "Tổng quan › Nhóm › Trang" đầu vùng nội dung,
  tự suy ra theo route. Tất cả gói gọn trong admin-shell.tsx — không đụng từng page.

decisions:
  - Branch switcher: desktop → topbar (trái, thay <h1>); compact → giữ trong sidebar drawer.
    Tách thành component BranchSwitcher (1 nguồn, 2 vị trí theo `compact`).
  - Breadcrumb: "Tổng quan(link /) › Nhóm(text) › Trang(current)". Nhóm suy từ
    DEFAULT_GROUPS/SYSTEM_ITEMS qua khớp path (exact → longest-prefix). Trang = pageTitle.
    Route "/" chỉ hiện "Tổng quan". Render đầu <main>, auto cho mọi page.

## Phases

| Phase | Nội dung | Status |
|-------|----------|--------|
| B1 | Tách `BranchSwitcher` (variant topbar/sidebar) + `Breadcrumb` + PATH→group index trong admin-shell.tsx | done |
| B2 | Topbar: bỏ <h1>, chèn BranchSwitcher (desktop) + spacer; Sidebar: BranchSwitcher chỉ khi compact; Breadcrumb đầu main | done |
| B3 | Tests: breadcrumb theo route + branch switcher ở topbar (desktop) / drawer (compact); vitest + build | done |

## Acceptance
- Desktop: topbar trái là bộ chọn chi nhánh (đổi được), không còn tiêu đề trang.
- Mọi trang có breadcrumb "Tổng quan › Nhóm › Trang" (route "/" chỉ "Tổng quan"); crumb Tổng quan điều hướng "/".
- Compact: branch switcher trong drawer; breadcrumb vẫn hiện.
- admin vitest xanh; tsc + build xanh; không đổi public contract (AdminShellProps giữ nguyên).

## Out of scope
- Đổi routing/URL; đa cấp breadcrumb cho sub-route sâu (chỉ nhóm + trang).
