---
phase: 9
title: "Realtime Monitor & M1 Hardening"
status: pending
priority: P2
dependencies: [8]
---

# Phase 9: Realtime Monitor & M1 Hardening

## Overview
Màn theo dõi ca thời gian thực cho QL (BH-08) + hardening để pilot bán thật: load test, DR drill, sẵn sàng golive CN1. (BH-08 + M1)

## Requirements
- Functional: QL xem ca đang chạy (vé theo loại, doanh thu lũy kế, nhịp bill 30', hủy & giảm giá), cập nhật ≤60s, xem trên mobile, chỉ CN thuộc phạm vi; so sánh cùng ca tuần trước.
- Non-functional: **load test BH-02.6** (5× tải 2 quầy×4 bill/phút, 30' liên tục, bill <1s); **DR drill** restore Postgres thành công; monitoring hạ tầng + cảnh báo nghiệp vụ tối thiểu.

## Architecture
- `sales` realtime: polling ≤60s (WebSocket là YAGNI ở quy mô này — polling đủ), tổng hợp theo ca; branch-scope qua guard P3.
- Load test: k6/artillery kịch bản 2 quầy×4 bill/phút ×5, 30'; đo p95 tạo bill, numbering không nghẽn.
- **DR drill**: bật PITR/backup; diễn tập restore về điểm thời gian, đối chiếu số bill liên tục sau restore.
- Monitoring: health/uptime, Sentry lỗi, metrics DB/API; cảnh báo nghiệp vụ tối thiểu M1: **bill kẹt sync >15'** (BH-05.7), chênh chốt ca.
- Checklist golive CN1: dữ liệu đầu kỳ (mã CN, bảng giá ký duyệt, user/PIN, thiết bị quầy đăng ký, máy in test).

## Related Code Files
- Create: `apps/api/src/sales/shifts/realtime.controller.ts`, POS/admin monitor screen (SC-VH-08 realtime), `load-test/` (k6), `docs/deployment-guide.md` (DR runbook), `docs/golive-cn1-checklist.md`
- Modify: monitoring config
- Delete: —

## TDD Steps (test-first)
1. **RED**: realtime aggregate — số liệu ca (vé/loại, doanh thu, hủy, giảm) đúng; chỉ trả CN trong phạm vi user.
2. **GREEN**: realtime endpoint + màn.
3. **RED (perf gate)**: load test script — assert p95 tạo bill <1s ở 5× tải 30'; numbering không trùng dưới tải.
4. **GREEN**: tối ưu nếu fail (index, tx scope).
5. **DR drill** (thủ công có checklist): restore từ backup → verify dải số bill nguyên vẹn.
6. **REFACTOR**: hoàn thiện cảnh báo + golive checklist.

## Success Criteria
- [ ] Realtime monitor ≤60s, mobile, đúng phạm vi CN.
- [ ] Load test pass BH-02.6 (bill <1s, 5× tải, 30').
- [ ] DR restore thành công, dải số bill nguyên vẹn sau restore.
- [ ] Monitoring + cảnh báo bill kẹt sync hoạt động.
- [ ] Golive CN1 checklist đầy đủ, sẵn sàng pilot song song 2 tuần.

## Risk Assessment
- Load test fail muộn → chạy sớm ngay khi P7 xong, đừng đợi P9. Pilot song song 2 tuần (chạy hệ mới cạnh cách cũ) là lưới an toàn — không cắt. DR chưa test = không có DR: bắt buộc drill trước golive.

## Red Team Hardening (2026-07-31)
- **C7 (DR không cấp trùng số)** — DR runbook phải: (1) reconcile counter từ **`MAX(bills)`**, KHÔNG dùng `counter.last_no` (restore reset row → cấp trùng số đã in); (2) giữ outbox client tới ack **bền (post-backup)**, hoặc client archive bill đã sync N ngày cho DR replay; (3) đổi tiêu chí DR từ "dải liên tục" → **"không trùng số + mọi temp bill reconcile"** (liên tục là cần, chưa đủ); (4) ưu tiên **PITR-to-crash (WAL)** hơn restore-to-backup-point để tránh reset. Test/drill khẳng định không có official number trùng sau restore.
- **M3 (tách BH-08 khỏi hardening)** — **tách phase**: hardening bắt buộc (load test, DR drill, monitoring, golive checklist) **KHÔNG** phụ thuộc BH-08. BH-08 (Should, cut #3) là **candidate cắt đầu tiên nếu Sprint 4 cháy** — đánh dấu rõ. **Bỏ so-sánh cùng-ca-tuần-trước** cho pilot 2 tuần (chưa có tuần trước — gold-plating).
- **M6 (DR là operational, không TDD)** — DR drill + golive checklist **relabel "operational verification"** có **owner + ngày dry-run**, không phải "TDD step". Chỉ phần code (realtime aggregate) mới test-first.
- New success criteria: [ ] DR criterion = không trùng số + reconcile temp bill (không chỉ liên tục); [ ] hardening bắt buộc không phụ thuộc BH-08; [ ] DR drill có owner + ngày.

<!-- Updated: Validation Session 1 — V3: chốt DR = PITR-to-crash (WAL archiving), RPO ~giây. Ưu tiên hơn restore-to-backup để tránh reset counter. -->
- **V3 (DR posture)** — dùng **PITR-to-crash (WAL archiving)**, RPO ~giây; runbook: replay WAL tới sát crash, reconcile `last_no` từ `MAX(bills)`. Restore-to-snapshot chỉ là fallback.

## Progress

- **Realtime monitor (BH-08) — DONE (code + test).** `GET /sales/shifts/:id/summary` tổng hợp ca: doanh thu, số khách, vé theo loại, hủy, nhịp bill 30'; **branch-scope** (chain-wide bypass). Test aggregate + scope. Màn admin "Theo dõi ca" đã dựng (poll 30s: doanh thu/bill/khách/hủy/nhịp 30/vé theo loại).
- **Stuck-sync alert (BH-05.7) — DONE.** POS cảnh báo banner khi bill kẹt outbox >15' lúc online. Test `hasStuckBills`.
- **Load test (BH-02.6) — DELIVERABLE.** `load-test/bill-create-load.js` (k6): gate p95<1s @5× tải (40 bill/phút) 30', 0 lỗi, không trùng số. Chạy operational (chưa chạy 30' ở đây).
- **DR runbook + go-live checklist — DELIVERABLE.** `docs/deployment-guide.md` (PITR-to-crash, reconcile counter từ `MAX(bills)`, DR pass = **không trùng số** + temp reconcile — C7/V3) + `docs/golive-cn1-checklist.md` (bảng giá ký, PIN, đăng ký thiết bị + test máy in, DR drill có owner+ngày, pilot song song 2 tuần).
- **Operational còn lại (không phải code):** chạy load test 30' thật + DR drill có owner/ngày trước golive; FE monitor screen nếu không cắt.

Toàn bộ code M1 xanh: 550 test (shared 60 · print-agent 10 · admin 26 · POS 53 · API unit 308 · API e2e 93).
