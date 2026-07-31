# Brainstorm Report — ILikeBuffet: Tech Stack & Infra

- **Ngày:** 31/07/2026
- **Skill:** /brainstorm (modes: none — no --html/--wiki)
- **Nguồn:** `documents/` (user-stories-mvp-full-jira.md, tài liệu dự án v1.0) + `mockup/` (design tokens, DECISIONS.md, ~80 màn HTML)
- **Trạng thái:** ĐÃ DUYỆT hướng kiến trúc tổng thể

---

## 1. Problem statement

Dựng hệ thống quản trị **chuỗi nhà hàng buffet hải sản bán vé, đa chi nhánh** (ILikeBuffet). Greenfield — chỉ có tài liệu + mockup, chưa có code. 30 user stories / 8 epic (E0–E7), 24 Must + 6 Should, kế hoạch 9 sprint (~4–5 tháng), pilot CN1 → rollout.

**Câu hỏi cần trả lời:** (1) Công nghệ dùng gì; (2) Có tách microservices không, nếu có thì service nào; (3) Cần lưu ý gì.

### Ràng buộc quyết định (từ hỏi–đáp)
- Đội: **TypeScript full-stack (Node)**.
- Quy mô 12–18 tháng: **≤ 10 CN** (8 CN, ~2 quầy/CN).
- Ưu tiên: **cân bằng** tốc độ giao hàng / bền vững / rủi ro nghiệp vụ.
- ORM: **Prisma + raw SQL cho hot path** (đã chốt).
- Nơi deploy: để tư vấn → khuyến nghị **cloud tập trung, ưu tiên cloud VN**.

### 4 tính năng "không bao giờ cắt" (xương sống kiến trúc)
BH-05 Offline POS · TC-02 Đối soát 3 chiều + khóa sổ · KH-02 Kiểm kê & chênh lệch · GA-01 Audit log append-only 24 tháng.

### Ràng buộc kiến trúc rút từ AC
Branch-scoping ở **tầng server** (cross-branch → 403) · **server là nguồn giá duy nhất** · **bill snapshot** bất biến · **đánh số bill liên tục** không nhảy số theo CN/ngày · **pre-aggregate** cho dashboard (<3s, 8CN×12 tháng) · giá vốn **bình quân gia quyền** · import/export Excel **đúng mẫu kế toán thật** · 6 vai trò cố định + duyệt PIN.

---

## 2. Approaches đã cân nhắc

| Hướng | Ưu | Nhược | Verdict |
|---|---|---|---|
| **Microservices** (tách BE theo domain) | Scale/độc lập triển khai | Distributed transaction ở đúng chỗ nhạy cảm (tiền, số bill, đối soát); over-engineering ở ≤10 CN | ❌ Loại |
| **Modular monolith** (1 BE, module theo epic) | Transaction mạnh, đơn giản, rẻ, đường tách sau rõ | Phải giữ kỷ luật ranh giới module | ✅ **Chọn** |
| Monolith "big ball of mud" | Nhanh nhất ban đầu | Không tách được sau, khó test theo miền | ❌ Loại |

Offline: **PWA + IndexedDB (client-side)** vs **server-tại-CN**. Chọn **PWA** — AC chỉ đòi trụ 30' mất mạng / 200 bill/máy; server-tại-CN nhân đôi vận hành mà không thêm giá trị trong ngưỡng AC.

---

## 3. Giải pháp khuyến nghị

### 3.1 Tech stack

| Lớp | Chọn | Lý do |
|---|---|---|
| Backend | **NestJS** (Node+TS) | Module system = ranh giới modular-monolith; Guard/Interceptor ép branch-scoping + audit log ở MỘT chỗ |
| DB | **PostgreSQL** | Transaction mạnh, row-lock cho bill numbering & giá vốn, JSONB cho audit before/after, summary table cho dashboard |
| ORM | **Prisma** + **raw SQL/`FOR UPDATE` cho hot path** | DX nhanh 90% CRUD; đánh số bill + giá vốn dùng lock tường minh |
| Admin FE (office) | React + Vite + TS, TanStack Query + Table, **build trên design tokens có sẵn** | ~35 màn nặng bảng; tôn trọng tokens + DECISIONS.md, KHÔNG kéo MUI/AntD đè |
| POS FE (ops) | **PWA riêng** cùng stack + Dexie/IndexedDB + Service Worker + sync engine | Offline-first sống ở client; release riêng |
| In bill | **Print agent local** (Node/Electron) trên máy quầy | Web không đẩy máy in nhiệt USB ổn định (BH-04.5) |
| Auth | JWT access ngắn + refresh, role+branch trong token; **PIN hash argon2** cache client cho duyệt offline | Khóa tài khoản ≤30s = token ngắn + revoke list |
| Async | **BullMQ + Redis** (worker cùng codebase, process riêng) | Sync bill + pre-aggregate không chặn POS |
| Khác | ExcelJS · S3-compatible (ảnh chứng từ) · Docker | — |

### 3.2 Infra — KHÔNG microservices; tách theo ranh giới process/client

**1 Modular Monolith**, module map thẳng theo Components doc Jira:
`platform · sales · finance · purchasing · inventory · reporting · audit`

Tách deploy chỉ ở nơi có **lý do vận hành thật** (không theo domain):

```
[ Admin SPA (office) ]──┐        static hosting, release riêng
[ POS PWA (ops, offline)]─┤──→ [ API Monolith (NestJS) ]──→ [ PostgreSQL ]
[ Print agent (local/quầy)]┘            │                        [ Redis ]
                                    [ Worker (sync + aggregate) ] [ Object storage ]
```

1. **Admin SPA** — office, 1440 cố định
2. **POS PWA** — ops, offline, release riêng (ổn định POS bất khả xâm phạm)
3. **API monolith** — toàn bộ nghiệp vụ
4. **Worker** — cùng code, process riêng (sync + pre-aggregate), không chặn POS
5. **Print agent** — local từng máy quầy
6. Managed: Postgres + Redis + Object storage

### 3.3 Deploy
**Cloud tập trung 1 backend + PWA offline-first.** Ưu tiên **cloud VN (VNG/Viettel)** cho data-residency + latency + giá; AWS ap-southeast-1 (SG) nếu đội quen tooling AWS. **Không** đặt server tại từng CN.

### 3.4 BH-05 Offline — thiết kế chi tiết

**Nguyên tắc:** bill offline là **event append-only, không sửa** → hàng đợi một chiều, server là trọng tài. Không cần CRDT.

- **Cache cục bộ** (IndexedDB, refresh mỗi lần online): danh mục vé, bảng giá hiệu lực + **bảng giá tương lai đã công bố** + lịch lễ + khung giờ, chương trình giảm, **hash PIN QL**. → tự áp giá đúng 0h dù offline (BH-05.6).
- **Đánh số:** offline cấp **số tạm** `[CN]-[YYMMDD]-T[MÃ MÁY][NNN]`; mỗi bill mang **UUID client ổn định**; khi sync server cấp **số chính thức** qua bảng counter `(CN,ngày)` + `SELECT FOR UPDATE`, lưu kèm số tạm, ack.
- **Idempotent:** server dedup theo UUID → retry an toàn (điều kiện sống-còn).
- **Sync engine:** hàng đợi FIFO IndexedDB → gửi batch khi online → nhận map `{uuid→số}` → xóa queue. Banner đỏ + đếm chờ; kẹt >15' → cảnh báo đỏ (BH-05.7).
- **Chặn khi offline:** mở ca máy chưa mở hôm nay · hủy bill đã sync · chốt ca (nhập tạm) · voucher giới hạn lượt.

**6 kịch bản test AC:** (a) rớt lúc thanh toán — ghi IndexedDB trước gọi mạng; (b) 2 máy offline lệch nhau — dải tạm riêng theo mã máy; (c) chập chờn 30s — idempotent+backoff; (d) tắt nguồn 20 bill — IndexedDB bền; (e) xuyên 0h — timezone Asia/Ho_Chi_Minh, đổi dải số, bill giữ ngày lúc tạo; (f) bảng giá mới 0h — giá tương lai cache sẵn.

**Kỷ luật:** spike 2–3 ngày ngay Sprint 3; QA test plan riêng; điểm chốt đúng đắn = **idempotency UUID + gapless counter có lock**.

### 3.5 Chi phí & vận hành

**Tải thực:** ~64 bill/phút đỉnh ≈ 1 bill/giây — rất nhẹ, 1 VM nhỏ dư sức. Không over-provision.

| Thành phần | AWS SG | Cloud VN |
|---|---|---|
| API+Worker (1 VM 2vCPU/4GB) | ~$30–40 | ~300–500k VNĐ |
| Postgres managed | single-AZ ~$30 · multi-AZ ~$70–100 | ~500k–1tr VNĐ |
| Redis nhỏ | ~$15 / $0 | ~200k / $0 |
| Object storage + CDN | ~$5–15 | ~100–300k VNĐ |
| **Tổng/tháng** | **~$80–100 (single) · ~$130–180 (multi-AZ)** | **~1.5–3 tr VNĐ** |

**Backup/DR:** Postgres PITR (RPO ≤5', RTO <1h) + multi-AZ auto-failover; object storage versioning; audit 24 tháng → cold sau vài tháng; hàng đợi offline = DR tự nhiên cho POS; **diễn tập restore 1 lần trước golive**.

**Monitoring:** hạ tầng (health/uptime, Sentry, metrics+log, alert 5xx/DB/disk); nghiệp vụ nằm trong app (BC-01.3 — bill kẹt sync, chênh đối soát, ghi đè âm) là cảnh báo cho *chủ*. Migration không phá hủy; release POS staged.

**Chi phí ẩn:** phần cứng quầy (máy in nhiệt 80mm, tablet/POS 15", mini-PC print agent — chốt model Sprint 0); auto-update print agent.

---

## 4. Cần lưu ý (map vào 4 tính năng không cắt)

1. **Số bill gapless (BH-04):** KHÔNG dùng Postgres SEQUENCE (nhảy số khi rollback) → bảng counter `(CN,ngày)` + `FOR UPDATE`. Mìn dữ liệu #1.
2. **Offline sync (BH-05):** bill append-only → UUID + server idempotent dedup + cấp số + ack. Không CRDT. Spike Sprint 3.
3. **Server nguồn giá + branch-scoping (VG-02, NT-02.4):** ép ở 1 Guard/Interceptor; test 403 cross-branch tự động.
4. **Bất biến + audit (GA-01, TC-02):** audit table append-only (thu quyền UPDATE/DELETE ở DB role); khóa sổ chặn ghi ngày đã khóa (service+trigger); bill snapshot copy giá/tên, không FK sống tới bảng giá.
5. **Giá vốn bình quân gia quyền (MH-02.5):** module riêng, test bằng ví dụ số; cập nhật tồn+giá trị trong transaction lock theo `(CN×nguyên liệu)`. Sai đây = sai toàn bộ COGS/P&L.
6. **Dashboard <3s (BC-01.5):** pre-aggregate bảng tổng hợp/ngày, cập nhật khi chốt ca/kiểm kê/khóa sổ. Không query bill thô.
7. **Excel = spec thật (BC-03.2):** thu 6 file mẫu kế toán Sprint 0; không code trước khi có mẫu.
8. **Phần cứng in:** chốt 2 model máy in nhiệt Sprint 0, test thật.
9. **Tiếng Việt & thời gian:** chuẩn hóa không dấu cho dedup import (NT-03.3); timezone Asia/Ho_Chi_Minh; mốc 0h đổi ngày + dải số offline (BH-05.6).
10. **Design system:** build component lib trên tokens + DECISIONS.md có sẵn; tôn trọng 2 width tier office/ops; quyết định #1 (terracotta không cho nút action).

---

## 5. Success metrics / validation

- BH-05: pass đủ 6 kịch bản test AC; không mất bill, không trùng số trong mọi kịch bản.
- BH-02: tạo & lưu bill <1s ở 5× tải (2 quầy × 4 bill/phút) trong 30' liên tục.
- BC-01: dashboard tải <3s với 8CN×12 tháng dữ liệu sinh giả lập.
- NT-02.4: user CN1 gọi API CN2 → 403 + log security (test tự động mọi endpoint mới).
- BC-03: Excel khớp tuyệt đối cột/thứ tự/định dạng theo 6 file mẫu thật.
- DR: restore thành công trong diễn tập trước golive.

---

## 6. Next steps / dependencies

- **Sprint 0:** thu 6 file Excel mẫu kế toán; chốt 2 model máy in; chốt 8 điểm `needs-client-confirm` (Phần C tài liệu); chốt phương pháp giá vốn với kế toán (viết trang quy tắc + ví dụ số).
- **Sprint 1:** dựng khung modular monolith + Guard branch-scoping + audit interceptor (GA-01 nền) trước tiên.
- **Sprint 3:** spike offline 2–3 ngày (BH-05) — không dồn Sprint 4.
- Handoff: `/ck:plan` với report này làm cơ sở.

---

## 7. Unresolved questions

1. **Nơi host cụ thể:** cloud VN (VNG vs Viettel) hay AWS-SG — cần chốt theo hợp đồng/ngân sách khách + yêu cầu data-residency.
2. **Staging:** dựng full hay rút gọn (ảnh hưởng chi phí ~1.5–2×).
3. **Print agent:** Electron (UI cấu hình) hay Node service headless — tùy quy trình vận hành máy quầy của khách.
4. **8 điểm `needs-client-confirm`** (tài liệu Phần C) chưa chốt — vài điểm ảnh hưởng data model (giá theo thời điểm tạo/thanh toán bill; vé miễn phí đứng một mình).
5. **Multi-AZ Postgres** ngay từ đầu hay bật khi golive — trade-off chi phí ~$40/tháng vs rủi ro downtime.
