---
title: "M2 — Vận hành & Quản trị (Admin UI completion)"
slug: m2-admin-operations-management
created: 2026-08-02
status: planned
priority: P1
mode: --tdd
---

# M2 — Vận hành & Quản trị

Mục tiêu: lấp khoảng trống **màn hình admin** cho phần backend M1 đã có, và bổ sung
vài endpoint còn thiếu, để vận hành thật đa chi nhánh (không phải chỉ bán ở POS).

**Bối cảnh (sau M1):** backend đã có auth/RBAC/devices, branches, master-data
(NL/NCC/tài khoản/lễ), ticket types/pricing/discounts, sales/bills/payments/shifts,
offline sync, audit GA-01. Admin mới có 4 màn: ticket-types, pricing, discounts,
shift-monitor. POS bán offline đủ.

**Nguyên tắc:** TDD mỗi phase (đỏ→xanh→refactor). Không fake data. Server là nguồn
sự thật. Mọi màn tôn trọng RBAC (fail-closed) + branch-scoping. Tiền là integer VND.

## Backend gaps đã xác nhận (phải bổ sung, không bịa)
- **Orders:** `GET /sales/bills` hiện chỉ list-by-shift (bắt buộc `shiftId`). Cần list
  theo branch/ngày/trạng thái/tìm kiếm + phân trang. → thêm endpoint.
- **Users admin:** KHÔNG có `users.controller`. Cần CRUD user + gán vai trò + reset
  mật khẩu/PIN + khoá/mở. → thêm module.
- **Devices:** `device.controller` không có `@Get` (chỉ register/suspend). Cần list.
- **Audit:** KHÔNG có endpoint query. Cần list/filter audit (insider-safe, read-only).

## Phases

| Phase | Tên | Backend | Phụ thuộc | Status |
|-------|-----|---------|-----------|--------|
| P0 | [List-screen foundation](./phase-00-admin-foundation.md) | — | — | **done** |
| P1 | [Đơn hàng (Orders) + Hoàn tiền](./phase-01-orders.md) | + list endpoint, + refund (schema/migration) | P0 | **done** |
| P2 | [Chi nhánh (Branches)](./phase-02-branches.md) | done (UI only) | P0 | **done** |
| P3 | [Master-data screens](./phase-03-master-data.md) | done (UI only) | P0 | **partial** (Suppliers done; P3b: ingredients/accounts/units/holidays/import) |
| P4 | [Người dùng, vai trò & thiết bị](./phase-04-users-roles-devices.md) | + users module, device list | P0 | planned |
| P5 | [Nhật ký (Audit viewer)](./phase-05-audit-viewer.md) | + audit query | P0 | planned |
| P6 | [RBAC-per-screen + hardening + docs](./phase-06-hardening-docs.md) | — | P1–P5 | planned |

```
P0 (foundation: DataTable, list hook, page scaffold, nav/routes)
 ├─ P1 Orders (+GET /sales/bills)
 ├─ P2 Branches (UI)
 ├─ P3 Master-data (UI + import)
 ├─ P4 Users/Roles/Devices (+users module, device list)   ← lớn nhất
 └─ P5 Audit viewer (+audit query)
        └─ P6 RBAC-per-screen + hardening + docs (sau P1–P5)
```

## Acceptance (toàn milestone)
- Mỗi màn: list + chi tiết + thao tác (CRUD/hành động) chạy trên endpoint THẬT, có
  loading/empty/error state, phân trang, tìm kiếm/filter nơi hợp lý.
- RBAC per màn: role không đủ quyền không thấy nav item + bị chặn ở route + API 403.
- Branch-scoping: dữ liệu tự giới hạn theo chi nhánh của user (HQ = chain-wide).
- TDD: test khoá hành vi cho mọi endpoint mới + component test cho luồng chính.
- Không giảm coverage; build + lint + test xanh mọi package.

## Quyết định đã chốt (2026-08-02)
1. **Orders (P1):** làm **Hoàn tiền (refund)** — nghiệp vụ tiền MỚI: schema `Refund` +
   migration + endpoint có PIN quản lý + audit. Xem chi tiết ở phase-01.
2. **Users (P4):** `QUAN_TRI_HQ` toàn quyền; `QUAN_LY_CN` tạo/quản user **trong chi
   nhánh mình**, KHÔNG nâng quyền vượt vai trò của chính mình. Mật khẩu khi tạo: **hệ
   thống sinh ngẫu nhiên, trả 1 lần, buộc đổi lần đầu** (`mustChangePassword`).
3. **Audit (P5):** `QUAN_TRI_HQ` xem tất cả; `QUAN_LY_CN` xem **trong phạm vi chi nhánh
   mình**.
4. **Master-data (P3):** **làm màn import Excel trong M2** (BE `POST /import/ingredients`
   đã có).

M2 giờ có thêm nghiệp vụ tiền (refund) → chú ý bất biến money y như M1 (integer VND,
sum(refunds) ≤ tổng đã trả, PIN + audit, không double-refund qua re-read trong tx).
