---
phase: 5
title: "Frontend Foundation & App Shells"
status: completed
priority: P2
dependencies: [3]
completed: 2026-08-01
---

# Phase 5: Frontend Foundation & App Shells

## Overview
Component library trên **design tokens có sẵn** (`mockup/_ds`) + vỏ 2 app: Admin SPA (office) và POS PWA (ops). Tôn trọng `mockup/DECISIONS.md`.

## Requirements
- Functional: layout shell (sidebar/topbar theo `mockup/index.html`), auth flow (login, chọn CN, refresh), data-fetch chuẩn (TanStack Query), bảng chuẩn (TanStack Table) theo Pattern 1 Data Table.
- Non-functional: **2 width tier** — `office` sàn 1440 không responsive, `ops` từ 768 (DECISION #8); vùng chạm ≥48px cho POS; brand terracotta **không** dùng cho nút hành động (DECISION #1).

## Architecture
- `packages/ui`: component lib bọc **tokens có sẵn** (import `mockup/_ds/.../tokens/*.css` hoặc port sang CSS vars nguồn), primitives qua Radix + tokens. **Không** MUI/AntD.
- `apps/admin`: React+Vite SPA; router; auth context; Query client; layout office.
- `apps/pos`: React+Vite **PWA** (vite-plugin-pwa) — service worker app-shell, layout ops touch. Bộ khung offline (Dexie) đặt sẵn, logic sync để P8.
- Data Table dùng chung: ellipsis 1 dòng + tooltip, row height cố định; `allowWrap` chuyển cả bảng auto (DECISION #10); dòng tổng dùng chung định nghĩa cột (DECISION #11).

## Related Code Files
- Create: `packages/ui/` (tokens bridge, Button, Table, Form controls, Overlay, Drawer), `apps/admin/src/{app,layout,auth}`, `apps/pos/src/{app,layout}`, `apps/pos/vite.config` (PWA)
- Modify: —
- Delete: —

## TDD Steps (test-first)
1. **RED**: component test (Vitest + Testing Library) — Button không render biến thể terracotta cho `variant="action"` (DECISION #1); vùng chạm POS ≥48px.
2. **GREEN**: Button + token bridge.
3. **RED**: DataTable — cột `allowWrap` bật → toàn bảng auto height; dòng tổng khớp cột thân bảng (snapshot cột).
4. **GREEN**: DataTable.
5. **RED**: auth flow — login → chọn CN → gọi API kèm scope; 401 → refresh; refresh fail → về login.
6. **GREEN** + **REFACTOR**: app shells + PWA manifest/service worker (chưa sync).

## Success Criteria
- [x] Component lib dùng tokens sẵn, tôn trọng DECISIONS #1/#8/#10/#11.
- [x] Admin SPA + POS PWA chạy, auth flow + chọn CN hoạt động.
- [x] POS cài được như PWA, app-shell offline (chưa có bill offline).
- [x] Test component + auth flow xanh.

## Risk Assessment
- Token bridge lệch mockup → lấy trực tiếp file token trong `mockup/_ds`, không tự chế lại màu. Nếu tokens thiếu biến, bổ sung có kiểm soát và ghi vào DECISIONS.

## Red Team Hardening (2026-07-31)
- **H10 (POS-first, không gold-plate lib)** — build **chỉ primitive các màn M1 dùng, ưu tiên POS** (touch Button, sell grid, payment panel, 1 bộ Form control, 1 Overlay). **Defer** DataTable đầy đủ (allowWrap auto-height, dòng tổng dùng chung, snapshot cột) sang wave báo cáo — M1 màn mỏng không cần. Lý do: xây lib theo consumer rủi ro nhất (POS) trước, không theo admin.
- **M6 (TDD đúng chỗ)** — bỏ red-green trên biến thể màu/snapshot cột (giòn, phantom). Thay bằng **token-conformance lint** (terracotta không cho `variant=action` — DECISION #1; touch ≥48px) + test **hành vi** (auth flow 401→refresh). Giữ test hành vi, bỏ test cấu trúc.
- **H8/SC6 (draft bill)** — Dexie scaffold ở P5 phải chừa chỗ cho **draft bill chưa thanh toán** (khác outbox bill đã hoàn tất của P8). Persistence draft là **Must (BH-02.7)** — owner chính ở P7, offline mở rộng ở P8; P5 chỉ dựng store, không logic.
- New success criteria: [x] chỉ primitive M1 (POS-first); [x] token-lint thay snapshot màu; [x] store draft sẵn sàng cho P7.

### Implemented (310 tests toàn repo) + post-review fixes (DONE_WITH_CONCERNS → applied)
- packages/ui (Button/FormField/Dialog/SellGridTile/PaymentPanel trên token bridge `mockup/_ds`), apps/admin (office SPA, sidebar/topbar 1440), apps/pos (Vite PWA sw+manifest, ops touch ≥48px, Dexie `draft_bills` store-only).
- **Fixes:** H1 điều hướng sau login (status guards + router-level test — trước đó kẹt /login); H2 hoist ApiClient → `packages/shared` (bỏ trùng lặp đường refresh bảo mật); M1 retry-401 gọi onAuthFailure; M4 dedup test `===1`; M5 báo lỗi khi GET /branches fail; M6 wire branch switcher; L1 lint message.
- **Accepted M1 risk (P8 follow-up):** access/refresh token + deviceSecret ở web storage (XSS) — chuyển httpOnly cookie + secure device-secret ở P8. mustChangePassword: server (P3 mcp gate) là gate thật, FE redirect chỉ UX.
- **Money rule exemptions** (payment-panel, sell-grid-tile) verified integer-only, không float — hợp lệ.
- **Deferred:** DataTable #10/#11 (wave báo cáo); POS icon PNG thật (trước store submission); full offline sync (P8).
