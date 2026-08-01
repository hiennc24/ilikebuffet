---
phase: 7
title: "Shift Bill Payment & Print"
status: pending
priority: P1
dependencies: [6]
---

# Phase 7: Shift Bill Payment & Print

## Overview
Lõi bán hàng **online trước**: mở ca, tạo bill (giá server, snapshot), thanh toán đa PT, in bill + **đánh số liên tục**, hủy bill có PIN, chốt ca. Nền để P8 offline-hoá. (BH-01→04, BH-06, BH-07)

## Requirements
- Functional: mở ca (tiền đầu ca, 1 ca/thiết bị, đóng treo ca cũ có PIN); tạo bill nút loại vé, panel realtime; thanh toán tiền mặt/CK VietQR/thẻ/kết hợp; in nhiệt 80mm; hủy bill giữ số + PIN; chốt ca tự tính + nhập tiền đếm + chênh lệch.
- Non-functional: **số bill `[MÃ CN]-[YYMMDD]-[NNNN]` liên tục không nhảy số** (server cấp, gộp mọi thiết bị); bill snapshot bất biến; thao tác chạm <300ms, lưu bill <1s; client **không gửi giá** (server tính lại).

## Architecture
- `sales` mở rộng: `shifts`, `bills`, `payments`.
- **Gapless numbering**: bảng `bill_counter(branch_id, business_date, last_no)` — cấp số trong tx qua `SELECT ... FOR UPDATE` rồi `+1`. **KHÔNG dùng SEQUENCE** (rollback gây nhảy số). Bill hủy giữ số (không đứt dải).
- Bill dùng **price-resolver P6 phía server** — client chỉ gửi (loại vé, SL); server tính & là số cuối.
- **Bill snapshot**: copy tên loại vé, đơn giá, khung giờ, loại ngày vào bill row — không FK sống tới bảng giá.
- VietQR động sinh từ TK CN (NT-01.2); xác nhận CK thủ công (đối khớp tự động thuộc wave TC-02).
- Chốt ca: tiền mặt lý thuyết = đầu ca + thu tiền mặt + phiếu thu − phiếu chi (phiếu thu-chi wave sau; M1 tối thiểu tiền mặt bill); chênh lệch tô đỏ, bắt ghi chú.
- **Print agent** (`packages/print-agent`): HTTP local nhận payload → in USB/LAN 80mm; lỗi in KHÔNG chặn lưu bill (BH-04.4); in lại đóng dấu "BẢN SAO" + log.

## Related Code Files
- Create: `apps/api/src/sales/shifts/`, `apps/api/src/sales/bills/` (`bill-number.service.ts` FOR UPDATE), `apps/api/src/sales/payments/`, `packages/print-agent/`, POS screens (SC-VH-08 ca, bán, thanh toán), SC-VH-01/02 bill
- Modify: `prisma/schema.prisma`; `audit` (hủy bill, đóng treo/chốt ca, giảm duyệt)
- Delete: —

## TDD Steps (test-first)
1. **RED**: `bill-number.spec.ts` — **concurrency**: N request đồng thời cùng CN/ngày → dải số liên tục, không trùng, không nhảy; rollback 1 tx **không** để lại lỗ số.
2. **GREEN**: bill-number service với `FOR UPDATE`.
3. **RED**: tạo bill — client gửi giá sai → server bỏ qua, tự tính từ resolver; bill lưu snapshot; đổi bảng giá sau đó không đổi bill cũ.
4. **GREEN**: bill create + snapshot.
5. **RED**: thanh toán kết hợp tổng phải khớp; tiền mặt < tổng → chặn; hủy bill giữ số + cần PIN; chốt ca tính chênh lệch đúng.
6. **GREEN** + **REFACTOR**: payments, cancel, close-shift, print agent (in lỗi không chặn lưu).

## Success Criteria
- [ ] Đánh số liên tục, không trùng/không nhảy dưới concurrency (test song song).
- [ ] Server là nguồn giá; client gửi giá bị bỏ qua.
- [ ] Bill snapshot bất biến trước thay đổi cấu hình.
- [ ] Hủy bill giữ số + PIN + audit; chốt ca chênh lệch đúng.
- [ ] Lỗi in không tạo bill trùng, không chặn lưu.

## Risk Assessment
- Numbering là mìn #1. Test concurrency là điều kiện Done. Print agent phần cứng: chốt 2 model máy in Sprint 0, test thật (BH-04.6). Đóng treo ca (BH-01.4) chỉ đóng băng số liệu chờ wave TC-03 xử lý — M1 chỉ cần đánh dấu + audit.

## Red Team Hardening (2026-07-31)
- **C4 (lock scope ngắn + ordering)** — cấp số trong **scope lock ngắn** (sub-tx/advisory lock) đóng **trước** payment+audit; hoặc counter increment là **write cuối trước commit** với thứ tự lock cố định **counter→audit** (không đảo). **Print gọi SAU commit** (BH-04.4). Wrap **deadlock-retry cùng UUID** để tx bị kill re-run không cấp trùng. **Test contention** (không chỉ correctness) là Done của P7, không đẩy P9.
- **H8/SC6 (draft bill persistence — Must BH-02.7)** — thêm vào Requirements + TDD: bill **đang tạo dở (chưa thanh toán)** survive refresh / screen-lock (NT-04.5) / rớt mạng, giữ local tới khi thanh toán hoặc chủ động hủy nháp. Khác với outbox bill hoàn tất (P8). Test: nhập 10 vé → refresh/lock → còn nguyên.
- **M1 (IDOR object-level)** — cancel/sửa bill chỉ cho khi **bill thuộc ca ĐANG MỞ của chính thiết bị/thu ngân** (BH-06.2), không chỉ cùng CN. Test: cross-cashier cancel + closed-shift cancel → 403 + audit.
- **H6 (print transport)** — PWA HTTPS → `http://localhost` = **mixed-content/CORS block**. Spike transport (TLS localhost / loopback exemption / agent-hosted origin) + CORS config; **integration test agent thật** (không mock). Sprint-0 chọn máy in là `blockedBy` P7 + **model fallback** đặt tên.
- **C8 (temp high-water-mark)** — chốt ca: device upload **high-water-mark temp index** (không chỉ bill sống sót) để P8/GA-02 phân biệt void/suppression/hole.
- **C7 (numbering vs DR)** — `bill_counter.last_no` phải reconcile-able từ `MAX(bills)` (dùng ở DR P9).
- New success criteria: [ ] test contention pass ở P7; [ ] draft bill survive refresh/lock; [ ] cross-cashier/closed-shift cancel bị chặn; [ ] print agent test qua transport thật.

<!-- Updated: Validation Session 1 — V4: bill-create validation default = phải có ≥1 vé giá>0 (dùng policy object từ P6, đảo được). V1: snapshot dùng đơn giá tại createdAt. Chờ khách ký #3/#4. -->
- **V4/V1** — validation tạo bill dùng **policy object** (default ≥1 vé có phí) + snapshot đơn giá theo `createdAt`; đổi chiều = đổi config, không sửa code.

## Progress

**Backend sales core — DONE (46 test: 23 unit + 23 e2e real-Postgres).**
- Schema + migration `20260801170000`: Shift (one OPEN/device partial unique), BillCounter, Bill (seq+number, snapshot fields, `(deviceId,clientUuid)` dedup), BillLine, Payment.
- `BillNumberService` — gapless `SELECT … FOR UPDATE` (no SEQUENCE). **Concurrency test pass**: 50 song song → 1..N no dup/gap; rollback không đốt số; cancel giữ số (C4/C7 gate ✅).
- `ShiftsService` — open/close (chênh lệch chỉ tính CASH, bắt ghi chú)/force-close (PIN QL); audit.
- `BillsService` — giá server (resolver P6), snapshot bất biến (test đổi giá sau → bill cũ không đổi), số trong tx (lock counter→audit), idempotent theo clientUuid; cancel giữ số + PIN + **IDOR guard** (chỉ ca OPEN của chính thiết bị — cross/closed-shift → 403 + audit, M1 ✅).
- `PaymentsService` — tổng thanh toán = tổng bill (chặn thiếu tiền), chặn thanh toán 2 lần.

**POS PWA — DONE (26 test).** Session context (device id + gate mở ca) → màn Bán (grid loại vé thật, ước giá qua `/sales/pricing/resolve`, giỏ hàng lưu Dexie **survive refresh/lock** H8, hydrate khi mở lại) → PayDialog (tạo bill server = tổng + số bill chuẩn, idempotent theo clientUuid; thanh toán kết hợp phải khớp tổng; VietQR tối thiểu; print stub; xoá draft khi xong). Dev proxy + prefill login.

**print-agent — DONE (10 test).** `packages/print-agent`: ESC/POS builder 80mm (header/dòng/tổng/thanh toán/BẢN SAO/cut), PrintDriver (Loopback M1 + USB/LAN stub fail-loud chờ Sprint-0), HTTP server localhost. Lỗi in báo 502 **không chặn bán** (BH-04.4); CORS cho POS; H6 mixed-content ghi chú Sprint-0. **Real-printer test vẫn blocked** chờ chọn 2 model.

**Hủy bill UI — DONE (3 test).** `ShiftBillsPanel` liệt kê bill ca (`GET /sales/bills?shiftId`) + dialog hủy (lý do + id QL + PIN → `POST /sales/bills/:id/cancel`); 403 (PIN sai/IDOR) hiện lỗi rõ; giữ số. Smoke test live: tạo bill → PIN sai 403 → PIN đúng CANCELLED giữ số ✅.

**Còn lại P7 (polish, không chặn M1 core):** nối print stub POS → print-agent (HTTP); VietQR hoàn thiện (QR động từ TK CN). Load test BH-02.6 (<1s ở 5× tải) → **P9**.
