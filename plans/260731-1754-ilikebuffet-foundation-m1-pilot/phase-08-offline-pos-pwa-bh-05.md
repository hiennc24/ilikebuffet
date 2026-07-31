---
phase: 8
title: "Offline POS PWA (BH-05)"
status: pending
priority: P1
dependencies: [7]
---

# Phase 8: Offline POS PWA (BH-05) ★ không được cắt

## Overview
Offline-hoá quầy: tạo/in bill khi mất mạng, tự sync khi có mạng, số tạm→số chính thức, **idempotent**. Mảnh rủi ro kỹ thuật cao nhất. (BH-05)

## Requirements
- Functional: cache danh mục/bảng giá(gồm tương lai)/lịch lễ/khung giờ/giảm giá/hash PIN QL; offline chạy trọn BH-02/03/04 ≥30', ≤200 bill/thiết bị; số tạm `[CN]-[YYMMDD]-T[MÃ MÁY][NNN]`; sync cấp số chính thức lưu kèm số tạm; duyệt PIN offline bằng hash cache.
- Non-functional: **không mất bill, không trùng số** trong mọi kịch bản; giá offline áp **y hệt server** (dùng chung resolver P6).

## Architecture
- **Nguyên tắc**: bill offline = event append-only, không sửa → hàng đợi 1 chiều, server trọng tài. Không CRDT.
- Client (Dexie/IndexedDB): store `cache` (catalog/pricing/holidays/pinHash), store `outbox` (bill chờ sync, mỗi bill có **UUID ổn định** sinh lúc tạo).
- **Pricing offline**: import `price-resolver` từ `packages/shared` (pure) → áp giá cùng logic server; giá tương lai cache kèm ngày hiệu lực → tự áp đúng 0h (BH-05.6).
- **Sync engine**: online → gửi batch outbox → server **dedup theo UUID** (idempotent), cấp số chính thức qua bill-counter P7, trả map `{uuid→số}` → client cập nhật + xóa outbox. Retry backoff an toàn.
- Chặn offline: mở ca máy chưa mở hôm nay, hủy bill đã sync, chốt ca (nhập tạm), voucher giới hạn lượt.
- Banner đỏ + đếm chờ; bill kẹt >15' khi online → cảnh báo (BH-05.7). Timezone client Asia/Ho_Chi_Minh cho mốc 0h đổi ngày/dải số.

## Related Code Files
- Create: `apps/pos/src/offline/` (`db.ts` Dexie, `outbox.ts`, `sync-engine.ts`, `offline-pricing.ts`), `apps/api/src/sales/bills/sync.controller.ts` (idempotent batch)
- Modify: `apps/api/src/sales/bills/bill-number.service.ts` (nhận số tạm lưu kèm), `apps/pos` bán/thanh toán dùng outbox
- Delete: —

## TDD Steps (test-first) — 6 kịch bản AC là bộ test cốt lõi
1. **RED**: sync idempotent — gửi cùng UUID 2 lần → 1 bill, 1 số chính thức (server unit + POS integration).
2. **GREEN**: sync controller dedup + client sync engine.
3. **RED (6 kịch bản BH-05.6)**: (a) rớt lúc thanh toán → bill trong IndexedDB, không mất; (b) 2 máy offline lệch nhau → không trùng số; (c) chập chờn 30s/10' → không nhân bản; (d) tắt nguồn còn 20 bill → mở lại còn đủ; (e) xuyên 0h → đổi dải số, bill giữ ngày tạo; (f) bảng giá mới 0h → giá tương lai cache tự áp.
4. **GREEN**: outbox bền + đổi ngày + offline-pricing.
5. **RED**: duyệt PIN offline bằng hash cache; chặn đúng thao tác không cho offline.
6. **GREEN** + **REFACTOR**: banner/queue UI + cảnh báo kẹt sync.

## Success Criteria
- [ ] 6 kịch bản AC pass tự động; **không mất, không trùng số** trong mọi kịch bản.
- [ ] Sync idempotent theo UUID (gửi lại vô hại).
- [ ] Giá offline khớp server (cùng resolver).
- [ ] Chặn đúng thao tác offline; PIN offline hoạt động.
- [ ] Offline ≥30', ≤200 bill/thiết bị.

## Risk Assessment
- Rủi ro cao nhất plan. **Spike 2–3 ngày ngay Sprint 3** (song song P6/P7), không dồn. QA viết test plan riêng, tự động hoá tối đa 6 kịch bản. Điểm sống-còn: idempotency UUID + gapless counter có lock (đã dựng P7). Không mở rộng sang sửa bill offline (giữ append-only) để tránh merge phức tạp.

## Red Team Hardening (2026-07-31) — path rủi ro cao nhất, siết mạnh nhất
- **C1 (authz + UUID namespace)** — sync controller chạy dưới **global branch guard** (P3); server **gán branch/device từ token**, từ chối (403+audit) bill nào có branch/device ≠ token. **Dedup theo `(device_id, uuid)`** (không chỉ uuid) → device A không thể hijack/suppress uuid của B. UUID v4 từ CSPRNG; dedup-hit khác content-hash → 409+audit.
- **C2 (server recompute giá)** — client gửi **line-items (loại vé + SL + created_at), KHÔNG gửi tiền**. Server **tính lại giá** từ price-book version hiệu lực tại `created_at`, reject/flag lệch quá làm tròn. "server trọng tài" = recompute, không chỉ cấp số.
- **C3 (PIN soft-gate)** — PIN duyệt offline chỉ là **soft gate**: (1) server **re-verify** mọi duyệt offline (giảm/hủy) khi sync, reverse cái fail; (2) **cap giá trị + số lần giảm offline/ca** (blast-radius); (3) lưu verifier peppered/HMAC hoặc token duyệt ký ngắn hạn, **không** lưu hash argon2 tái dùng. Ghi threat-note: hash local không enforce authz được.
- **C5 (idempotent thật)** — sync **luôn trả full map `{uuid→số}`** cho MỌI uuid trong request (kể cả đã dedup) — không bao giờ trả partial/"skipped". **Per-bill idempotent** (mỗi bill 1 tx + 1 key), KHÔNG all-or-nothing. Trả per-bill status (committed+số | retry). **Không bao giờ reject một sale đã in** — server nhận + flag kế toán (khách đã cầm bill giấy). Outbox xóa **chỉ khi nhận được số**, không theo HTTP 200. Test: resend batch đã commit → full map → clear outbox.
- **C6 (durability)** — `navigator.storage.persist()` lúc init, cảnh báo cứng nếu bị từ chối; **eager-sync mỗi bill** (không đợi batch) để thu hẹp cửa sổ offline; đo quota 200 bill + cache; kênh dự phòng (print-agent log local). **Kịch bản (g): eviction** (xóa DB giữa phiên) → phát hiện + cảnh báo.
- **C8 (temp-range)** — draft offline bỏ đi phải sync event **`voided_before_sync`**; chốt ca upload **high-water-mark temp index**; GA-02 phân biệt void / suppression / hole. Thêm kịch bản draft-bỏ vào bộ test.
- **H5 (clock skew)** — ghi skew `server−device` mỗi lần online; lệch >±2' **chặn offline + cảnh báo QL**; stamp bill kèm device-clock + offset server last-known-good; server **quarantine** bill skew xuyên 0h. Test: offline clock lệch xuyên 0h → server phát hiện, không im lặng nhận.
- **H3 (force-close)** — bill kẹt sync không thể phục hồi (device chết/DB evict) → **force-close có PIN QL + ghi ngoại lệ** (đóng băng chờ kế toán TC-03), không để khoá chốt ca vĩnh viễn. Test: stuck-bill → force-close path.
- New success criteria: [ ] sync authz + dedup theo (device,uuid); [ ] server recompute giá offline; [ ] full-map + per-bill idempotent, không reject sale đã in; [ ] persist()+eviction test; [ ] voided_before_sync + high-water-mark; [ ] clock-skew detect; [ ] force-close có lối thoát.
