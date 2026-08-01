---
phase: 6
title: "Ticket Types & Price Matrix"
status: pending
priority: P1
dependencies: [4, 5]
---

# Phase 6: Ticket Types & Price Matrix

## Overview
Loại vé + ma trận giá đa chiều (loại vé × khung giờ × loại ngày × CN) có hiệu lực theo thời gian, versioning; giảm giá/voucher có duyệt PIN. **Server là nguồn giá duy nhất.** (VG-01, VG-02, VG-03)

## Requirements
- Functional: loại vé (màu, thứ tự, cờ miễn phí giá=0 vẫn đếm khách); khung giờ **không chồng lấn**; loại ngày (Thường/Cuối tuần/Lễ, ưu tiên Lễ>CT>Thường); bảng giá **versioned theo ngày hiệu lực** (không sửa đè bản đang hiệu lực); giá riêng theo CN fallback về giá chuỗi; giảm % / số tiền / voucher, tối đa 1 chương trình/bill, giảm thủ công vượt ngưỡng cần PIN QL.
- Non-functional: giá tính theo **thời điểm TẠO bill** (needs-client-confirm #3 — chốt trước); voucher trừ quỹ lượt realtime (2 quầy không vượt tổng).

## Architecture
- `sales` module: `ticket-types`, `pricing` (price-book versions, cells), `discounts`.
- **Pricing resolver** thuần, testable: input (CN, thời điểm, loại vé) → đơn giá; chọn version hiệu lực + ô (khung giờ×loại ngày) + fallback CN→chuỗi. Đây là hàm sẽ cache xuống client ở P8 → viết pure + có bộ test số.
- Khung giờ chồng lấn → chặn khi lưu (constraint + validate). Ngoài mọi khung → không tạo bill được (needs-client-confirm #2).
- Voucher quota: counter có lock (giống bill numbering) tránh vượt lượt.
- Bảng giá xuất Excel để khách ký duyệt trước golive (VG-02.7).

## Related Code Files
- Create: `apps/api/src/sales/ticket-types/`, `apps/api/src/sales/pricing/` (`price-resolver.ts` pure), `apps/api/src/sales/discounts/`, admin screens (SC-TD-01→06, SC-TD tickets/pricing)
- Modify: `prisma/schema.prisma`; `audit` (đổi bảng giá/loại vé, duyệt giảm)
- Delete: —

## TDD Steps (test-first)
1. **RED**: `price-resolver.spec.ts` — bộ ví dụ số: Lễ>CT>Thường; ô (Người lớn×Tối×Lễ); fallback CN→chuỗi; bill tạo 13:58 thanh toán 14:05 → giá theo **thời điểm tạo**; bảng giá tương lai không ảnh hưởng hôm nay, tự áp đúng 0h.
2. **GREEN**: resolver.
3. **RED**: khung giờ chồng lấn → lưu bị chặn; sửa đè bản đang hiệu lực → bị chặn (phải tạo version mới).
4. **GREEN**: pricing CRUD + versioning.
5. **RED**: giảm thủ công vượt ngưỡng → yêu cầu PIN QL; PIN sai 3 → hủy + log; voucher hết lượt → lỗi rõ; quota không vượt khi 2 request đồng thời.
6. **GREEN** + **REFACTOR**: discounts + admin screens trên component lib P5.

## Success Criteria
- [ ] Price resolver pure, phủ mọi ví dụ số AC VG-02 (nền để cache offline P8).
- [ ] Khung giờ không chồng; bảng giá versioned bất biến khi đang hiệu lực.
- [ ] Vé miễn phí giá 0 vẫn đếm khách.
- [ ] Giảm vượt ngưỡng cần PIN; voucher quota an toàn concurrency.
- [ ] Xuất Excel bảng giá.

## Risk Assessment
- Resolver là trái tim đúng-giá + nền offline. Phải **pure, deterministic, cùng code chạy cả server lẫn client** (đặt ở `packages/shared`) để offline áp giá y hệt server. needs-client-confirm #2/#3 chốt trước khi code.

## Red Team Hardening (2026-07-31)
- **C9 (hard gate + contract-not-answer)** — **chặn P6** tới khi khách chốt #2/#3/#4. **KHÔNG** encode câu trả lời chưa chốt vào test. Resolver nhận **cả `createdAt` và `paidAt`**, chọn cái nào quyết giá bằng **1 config constant** → đảo chiều = 1 dòng, không rewrite P6/P7/P8. Test khóa **contract** (một timestamp quyết giá), parametrize giá trị.
- **C2/AD3 (purity ≠ hydration)** — tách 2 loại test: (1) **resolver purity** (deterministic given inputs); (2) **hydration-parity** — seed cache client từ snapshot server thật, diff output qua kịch bản **đổi version bảng giá GIỮA ngày khi device offline** (không chỉ 0h). Cache có **version-stamp**; reconnect phát hiện "cache cũ hơn server" → **flag lệch giá** bill offline đã tạo (không im lặng chấp nhận). Đây là điều kiện để C2 (server recompute ở P8) có nghĩa.
- **M7 (free-ticket invariant)** — test đặt tên rõ: "vé miễn phí cộng vào tổng số khách cho cost/khách (BC-01 wave sau)" để refactor tương lai không phá denominator.
- **M2** — dùng holiday-calendar entity từ P4 (không tự tạo ở P6).
- New success criteria: [ ] resolver nhận createdAt+paidAt, chọn qua config; [ ] hydration-parity test qua version-cutover-offline; [ ] cache version-stamp + flag lệch.

<!-- Updated: Validation Session 1 — V1: default mốc giá = THỜI ĐIỂM TẠO bill (createdAt), giữ config paidAt để đảo. V4: default vé miễn phí PHẢI đi kèm ≥1 vé có phí (policy object, đảo được). Cả hai là default để build — CHỜ KHÁCH KÝ trước golive. -->
- **V1 (mốc giá)** — config default = `createdAt` (theo VG-02.5); vẫn giữ nhánh `paidAt`. Chờ khách ký.
- **V4 (vé miễn phí)** — policy default = bill phải có ≥1 vé giá>0; là policy object đảo được. Chờ khách ký.

## Progress

- **Backend (VG-01/02/03)** — resolver thuần ở `packages/shared` (60 test), `sales` module (ticket-types, pricing + Excel export, discounts + voucher quota `FOR UPDATE`), migration `20260801160000_pricing`. Unit test xanh toàn bộ.
- **Admin FE screens** — `/settings/ticket-types` (Loại vé), `/settings/pricing` (Khung giờ + Bảng giá version + Ma trận giá + Xuất Excel), `/settings/discounts` (Chương trình + Lý do). Trên component P5 (`@ilikebuffet/ui` + `_shared/admin-ui`). Wired vào router + nav. Admin build + lint sạch, 25/25 test xanh.
- **Còn lại P6**: e2e/integration tests (voucher concurrency real-DB, price-book versioning immutability) — cần Docker; hydration-parity + cache version-stamp → dời sang P8 (chưa có client cache).
