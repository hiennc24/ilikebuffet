---
title: "Adopt dtvadmin shell + react-table (fnb brand)"
slug: dtvadmin-table-layout
created: 2026-08-04
status: in-progress
priority: P2
---

context: |
  Tham chiếu dtvadmin (Next.js, @tanstack/react-table, shadcn-style). Mục tiêu: fnb admin
  (React 19 + Vite, inline-style tokens) mượn CẤU TRÚC/mật độ/tính năng của dtvadmin nhưng
  GIỮ brand ấm hiện tại (kem/terracotta + action xanh lá). Không đổi hệ màu, không dùng Tailwind.
  Mọi bảng hiện dùng chung DataTable đơn giản ở pages/_shared/admin-ui.tsx (contract Column
  key/header/render). Nâng lên react-table = đổi contract → xây layer MỚI song song, migrate dần
  "1 số table" (bắt đầu users/roles/permissions — đúng trang ref minh hoạ), giữ DataTable cũ cho phần còn lại.

decisions:
  - react-table stack MỚI ở pages/_shared/table/*, KHÔNG sửa DataTable cũ (coexist) → migrate từng trang, rollback dễ.
  - Style bằng token brand fnb (map surface-header→--bg-page, primary→--action-bg xanh lá…), KHÔNG oklch/xanh dương.
  - PageHeader chuẩn (breadcrumb + h1 lớn + actions phải + toolbar tabs) thay cho breadcrumb chữ nhỏ hiện tại; đặt trong vùng nội dung (giống ref).
  - Sidebar thêm thu gọn icon-rail (persist localStorage). Topbar: giữ cluster hiện có, thêm nút toggle rail.

## Phases

| Phase | Nội dung | Trạng thái |
|-------|----------|-----------|
| P0 | Foundation: add @tanstack/react-table; table primitives + DataTable(mới) + useDataTable + column helpers (selection/actions/sort-header) + Pagination(page-size+số trang) + Badge + Avatar — style token brand. Unit tests. | planned |
| P1 | PageShell/PageHeader: breadcrumb + h1 lớn + actions slots + toolbar tabs; nâng breadcrumb (collapse `…`). Tests. | planned |
| P2 | Sidebar thu gọn icon-rail (persist) + topbar toggle. Tests responsive. | planned |
| P3 | Pilot migrate: Users + Roles/Permissions sang DataTable mới + PageShell (badge/avatar/actions menu). Verify e2e-lite. | planned |
| P4 | Rollout chọn lọc (suppliers, ingredients, devices, purchase-orders…) sang DataTable mới — lặp, mỗi trang 1 commit. | planned |

## Acceptance
- DataTable mới: sort cột, chọn dòng + bulk bar, menu actions/dòng, cột ghim trái/phải, sticky header, skeleton loading, empty state, phân trang (page-size + số trang + tổng) — style brand ấm.
- DataTable cũ vẫn chạy cho trang chưa migrate (không regression).
- PageHeader: breadcrumb + tiêu đề h1 + nút actions phải; dùng ở trang pilot.
- Sidebar thu gọn được, trạng thái nhớ qua reload.
- Giữ brand fnb (không xanh dương/oklch). tsc + full admin vitest + build xanh sau mỗi phase.
- Không đổi public contract của DataTable cũ; layer mới là bổ sung.

## Out of scope (lần này)
- Migrate TẤT CẢ ~20 bảng (chỉ pilot + rollout chọn lọc; phần còn lại follow-up).
- Đổi hệ màu sang xanh dương; đổi routing/URL params sang nuqs (giữ usePagedList hiện có, thêm sort khi cần).
