---
title: "ILikeBuffet — Foundation & M1 Pilot"
description: "Nền tảng + M1 pilot bán thật CN1 (Sprint 1–4): E0 platform, GA-01 audit nền, E1 giá vé, E2 bán hàng + offline POS. TDD mỗi phase."
status: code-complete
priority: P1
branch: ""
tags: [fnb, pos, multi-branch, offline, tdd, nestjs]
blockedBy: []
blocks: []
created: "2026-07-31T11:04:17.447Z"
createdBy: "ck:plan"
source: skill
---

# ILikeBuffet — Foundation & M1 Pilot

## Overview

Greenfield. Xây nền tảng + tới mốc **M1: pilot bán thật CN1** (hết Sprint 4 theo `documents/user-stories-mvp-full-jira.md`). Phủ E0 (NT-01→04), GA-01 (audit nền), E1 (VG-01→03), E2 (BH-01→08 gồm **offline★**). Sprint 5–8 (tài chính/mua hàng/kho/báo cáo) = **wave plan sau**, lập khi M1 gần xong (8 điểm `needs-client-confirm` còn đổi data model).

**Stack (đã chốt qua brainstorm; điều chỉnh sau red-team):** NestJS modular monolith · PostgreSQL · Prisma + raw SQL/`FOR UPDATE` cho hot path · React Admin SPA + POS PWA offline · **Redis (chỉ cho revocation list ≤30s ở M1 — BullMQ/worker defer sang wave finance/reporting, H9)** · print agent local · cloud tập trung.
**Cơ sở:** `plans/reports/architecture-tech-infra-260731-1754-ilikebuffet-buffet-pos-report.md`.

**Mode:** `--tdd` — mỗi phase: viết test khóa hành vi (đỏ) → code (xanh) → refactor. Trọng tâm test: tiền, số bill, đối soát, phân quyền chéo CN.

### Bất biến "không được cắt" (xuyên plan — đã siết sau red-team)
1. **Gapless bill numbering** — bảng counter `(CN,ngày)` + `SELECT FOR UPDATE` trong scope lock **ngắn**, thứ tự lock cố định (counter→audit); KHÔNG dùng SEQUENCE. Gaplessness định nghĩa trên **số đã cấp** (rollback-safe); DR derive `last_no` từ `MAX(bills)`, không từ counter row (C4, C7).
2. **Offline sync = server trọng tài THẬT** — không chỉ dedup+cấp số mà **server recompute giá** (client gửi line-items, không gửi tiền), **re-verify duyệt PIN**, sync qua `BranchScopeGuard`, dedup theo `(device_id, uuid)`, **luôn trả full map `{uuid→số}`**, per-bill idempotent, **không bao giờ reject một sale đã in** (C1, C2, C3, C5).
3. **Branch-scoping fail-closed** — **global guard** áp mọi route mặc định; opt-out `@Unscoped()` được audit + CI liệt kê; cross-branch → 403 + log (H2).
4. **Audit append-only chống cả insider** — REVOKE app role + **trigger chặn UPDATE/DELETE mọi role (trừ superuser)** + export WORM off-box; bill snapshot bất biến (H1).
5. **Không mất bill** — `navigator.storage.persist()` + eager-sync + test eviction; temp-range high-water-mark tại chốt ca phân biệt void/suppression/hole (C6, C8).

### Hard gate: needs-client-confirm (C9)
Trước khi bắt đầu **P6**, phải chốt với khách #2 (giờ ngoài khung), **#3 (giá theo thời điểm TẠO hay THANH TOÁN bill)**, **#4 (vé miễn phí đứng một mình)**. Resolver encode **contract** (một timestamp quyết định giá), nhận cả `createdAt`+`paidAt`, chọn bằng 1 config — đảo chiều = 1 dòng, không rewrite. Trước **P4/P6 Excel**: chốt **#8 (6 file mẫu kế toán thật)** — column-map pluggable qua config (H7).

## Phases

| Phase | Name | Status | Stories |
|-------|------|--------|---------|
| 1 | [Scaffolding & Test Harness](./phase-01-scaffolding-test-harness.md) | Done | — (nền kỹ thuật) |
| 2 | [Audit Foundation (GA-01)](./phase-02-audit-foundation-ga-01.md) | Done | GA-01 |
| 3 | [Auth RBAC & Branch-Scoping](./phase-03-auth-rbac-branch-scoping.md) | Done | NT-02, NT-04 |
| 4 | [Branch & Master Data](./phase-04-branch-master-data.md) | Done | NT-01, NT-03 |
| 5 | [Frontend Foundation & App Shells](./phase-05-frontend-foundation-app-shells.md) | Done | — (FE nền) |
| 6 | [Ticket Types & Price Matrix](./phase-06-ticket-types-price-matrix.md) | Done (code; #2/#4 defaults chờ khách ký) | VG-01, VG-02, VG-03 |
| 7 | [Shift Bill Payment & Print](./phase-07-shift-bill-payment-print.md) | Done (core; print-wire/VietQR polish) | BH-01→04, BH-06, BH-07 |
| 8 | [Offline POS PWA (BH-05)](./phase-08-offline-pos-pwa-bh-05.md) | Done (offline core + hardening; C3 N/A M1) | BH-05★ |
| 9 | [Realtime Monitor & M1 Hardening](./phase-09-realtime-monitor-m1-hardening.md) | Done (code+ops; load/DR = operational) | BH-08, load/DR |

## Dependency graph

```
P1 Scaffolding
 └─ P2 Audit ── P3 Auth/RBAC ── P4 Branch/MasterData
                     │                 └─ P6 Tickets/Pricing ── P7 Shift/Bill/Print ── P8 Offline PWA ── P9 Monitor/Harden
                     └─ P5 FE Foundation ─────────────────────────┘ (FE feeds P6/P7)
```

- P1 → gốc mọi thứ.
- P2 sớm vì audit là DoD cross-cutting.
- P3 spine bảo mật; P4 phụ thuộc P3 (branch-scope).
- P5 (FE) song song được sau P3; feed màn cho P6/P7.
- P7 phụ thuộc P6 (giá) + P4 (CN). P8 phụ thuộc P7 (bill online chạy trước rồi mới offline hoá).
- **Spike offline (P8) khởi động sớm Sprint 3** dù code hoàn thiện sau P7 — theo ghi chú rủi ro AC BH-05.

## Acceptance (mốc M1)
- Bán thật CN1: mở ca → tạo bill (giá server) → thanh toán đa PT → in số bill liên tục → hủy có PIN → chốt ca; số đổ về đúng.
- Offline 6 kịch bản AC BH-05 pass; không mất/không trùng bill.
- Cross-branch → 403 tự động mọi endpoint.
- Audit append-only phủ danh sách bắt buộc GA-01.1.
- Load test BH-02.6: bill <1s ở 5× tải, 30' liên tục.

## Out of scope (wave sau)
E3 tài chính (TC), E4 mua hàng (MH), E5 kho (KH), E6 báo cáo (BC-02→04), E7 GA-02/03. TC-02/KH-02 là "không cắt" nhưng thuộc wave Sprint 5–7.

## Dependencies
Không có plan khác. **needs-client-confirm là HARD GATE** (xem mục trên) — không còn là ghi chú lịch. `prisma/schema.prisma` có **1 owner xuyên P4/P6/P7** (tránh migration song song — orchestration rule); **holiday-calendar entity thuộc P4** (P6 loại ngày Lễ + P8 cache offline đều phụ thuộc — M2).

## Red Team Review

### Session — 2026-07-31
**Findings:** 18 hợp nhất (từ ~32 raw, 4 reviewer) — **18 accepted, 0 rejected**.
**Severity:** 9 Critical, 10 High (gộp còn ghi), 7 Medium.
**Lenses:** Security Adversary · Failure Mode Analyst · Assumption Destroyer · Scope & Complexity Critic.
**Áp dụng:** mục `## Red Team Hardening` ở mỗi phase file + siết bất biến/hard-gate ở plan.md trên.

| # | Finding | Sev | Applied |
|---|---|---|---|
| C1 | Sync thiếu authz device→branch; UUID không namespace | Critical | P8, P3 |
| C2 | Giá offline client-trusted, server không recompute | Critical | P8, P6 |
| C3 | PIN duyệt offline brute-force, không re-verify khi sync | Critical | P8, P3 |
| C4 | Counter lock giữ suốt tx → contention/deadlock | Critical | P7, P2 |
| C5 | Lost-ACK/batch: full-map + per-bill idempotent, không reject sale đã in | Critical | P8 |
| C6 | IndexedDB evict = mất bill | Critical | P8 |
| C7 | DR restore reset counter → cấp trùng số | Critical | P9, P7 |
| C8 | Temp-range gap = false fraud + suppression không phát hiện | Critical | P8, P7 |
| C9 | needs-client-confirm coi như đã chốt → hard gate | Critical | P6, P7, plan |
| H1 | Audit chỉ REVOKE app role, insider/owner xóa được | High | P2 |
| H2 | Branch-scope opt-in decorator → global fail-closed | High | P3 |
| H3 | Chốt ca kẹt sync khoá vĩnh viễn → force-close có PIN | High | P7, P8 |
| H4 | Device registry client-only → server-side + secret | High | P3 |
| H5 | Clock skew thiết bị → sai giá/ngày xuyên 0h | High | P8 |
| H6 | Print agent HTTPS→localhost mixed-content/CORS | High | P7 |
| H7 | Excel build theo template tự chế → column-map pluggable | High | P4, P6 |
| H8 | Draft bill (Must BH-02.7) không survive refresh/lock | High | P7, P8 |
| H9 | BullMQ/Redis worker YAGNI cho M1 | High | plan, P1 |
| H10 | `packages/ui` full lib gold-plating → POS-first | High | P5 |
| M1 | IDOR object-level (cancel bill) | Medium | P7 |
| M2 | Holiday-calendar entity thiếu ở P4 | Medium | P4 |
| M3 | BH-08 (cut-first) hàn vào hardening → tách | Medium | P9 |
| M4 | Revocation ≤30s vs access token 5–10' | Medium | P3 |
| M5 | Folder epic rỗng + print-agent sớm ở P1 | Medium | P1 |
| M6 | TDD ceremony sai chỗ (P5 visual, P9 DR) | Medium | P5, P9 |
| M7 | Free-ticket count load-bearing cho cost/khách | Medium | P6 |

### Whole-Plan Consistency Sweep
Đã rà sau khi áp: (1) stack bỏ BullMQ khỏi M1 — đồng bộ plan.md + P1. (2) "server trọng tài" định nghĩa lại (recompute+re-verify) — đồng bộ P8 vs P6/P7. (3) counter lock scope ngắn + DR derive-from-bills — đồng bộ P7 vs P9. (4) global fail-closed guard thay opt-in — đồng bộ P3 vs invariant #3. (5) PIN hash cache chuyển P3→P8. (6) holiday-calendar thêm P4, tham chiếu P6/P8. Không còn mâu thuẫn tồn đọng.

## Validation Log

### Session — 2026-07-31 (mode=prompt, 4 câu)
Verification pass: **skip** (Red Team Review đã có evidence; greenfield, không codebase để verify; không `[UNVERIFIED]` tag). 4 quyết định chốt (đều default khuyến nghị):

| # | Quyết định | Chọn | Ảnh hưởng |
|---|---|---|---|
| V1 | Mốc tính giá (needs-client-confirm #3) | **Thời điểm TẠO bill** (default để build, **chờ khách ký**) | P6 resolver default `createdAt`; P7 snapshot; P8 offline |
| V2 | Khóa tài khoản ≤30s (M4) | **Check revocation mỗi request + Redis** | P3: mọi request tra revocation list; Redis giữ ở M1 (bác bỏ đề xuất bỏ Redis của SC3) |
| V3 | DR posture (C7) | **PITR-to-crash (WAL)**, RPO ~giây | P9 DR runbook; giảm rủi ro reset counter |
| V4 | Vé miễn phí đứng một mình (needs-client-confirm #4) | **Bắt buộc ≥1 vé có phí** (default để build, **chờ khách ký**) | P6/P7 policy object (đảo được) |

**Còn chờ khách ký:** V1, V4 là default để build (resolver/policy config-driven, đảo = đổi config) — vẫn phải lấy chữ ký khách trước golive. V2 xác nhận **Redis ở lại M1** (chỉ revocation), khớp H9 (bỏ BullMQ, giữ Redis).

### Whole-Plan Consistency Sweep (validation)
Propagate: V1→P6 (default createdAt, giữ config paidAt); V2→P3 (per-request revocation, Redis stays — không mâu thuẫn H9 vì H9 chỉ bỏ BullMQ); V3→P9 (PITR); V4→P6/P7 (policy default). Không mâu thuẫn mới. Verification Failed: 0 → plan đủ điều kiện cook.
