---
title: "M3 — Đối soát & Báo cáo (Reconciliation & Reporting)"
slug: m3-reconciliation-reporting
created: 2026-08-02
status: planned
priority: P1
mode: --tdd
---

# M3 — Đối soát & Báo cáo

Mục tiêu: cho chủ/kế toán/quản lý **tin được con số** của pilot — doanh thu thuần
(sau hoàn tiền), đối soát tiền mặt theo ca, và soát các bất thường offline
(quarantine + lỗ hổng số bill). Xây trực tiếp trên primitive đã có (shift summary,
cash variance khi đóng ca, bill.seq gapless, bill.quarantined, refund M2).

**Nguyên tắc:** TDD. Read-mostly (rủi ro thấp hơn M2). Server là gate; mọi báo cáo
**branch-scoped** (HQ/chủ/kế toán chuỗi = chain-wide; QL_CN = chi nhánh mình). Tiền là
integer VND — dùng `sumVnd`/helpers, không float. Không lộ hash/mã nội bộ.

## Primitive sẵn có (tái dùng, không làm lại)
- Shift summary per-ca (revenue/bill/guest/ticketsByType) — **nhưng chưa trừ refund**.
- Shift close: `expectedCashVnd`/`countedCashVnd`/`varianceVnd`/`varianceNote`.
- `Bill.seq` gapless theo `(branchId, businessDate)` → phát hiện lỗ hổng = seq thiếu.
- `Bill.quarantined` + `quarantineReason` → hàng đợi soát.
- `Refund` (M2) → doanh thu thuần.
- FE: `usePagedList`, `DataTable`, `DetailDrawer`, `FilterBar`, `api.download` (xlsx).

## Backend gaps (thêm mới — read-mostly)
- `GET /sales/reports/revenue` — tổng hợp doanh thu (gross/refund/net) theo ngày/chi nhánh/ca.
- `GET /sales/reports/shift-cash` — đối soát tiền mặt theo ca (variance).
- `GET /sales/reports/quarantine` — danh sách bill quarantine để soát.
- `GET /sales/reports/number-gaps` — lỗ hổng số bill (seq thiếu) theo chi nhánh/ngày.
- `GET /sales/reports/dashboard` — KPI nhanh (doanh thu hôm nay, ca mở, quarantine).

## Phases

| Phase | Tên | Backend | Phụ thuộc | Status |
|-------|-----|---------|-----------|--------|
| R0 | [Reporting foundation](./phase-r0-foundation.md) | — | — | planned |
| R1 | [Báo cáo doanh thu (net)](./phase-r1-revenue.md) | + revenue agg | R0 | planned |
| R2 | [Đối soát tiền mặt theo ca](./phase-r2-shift-cash.md) | + shift-cash | R0 | planned |
| R3 | [Đối soát offline (quarantine + số bill)](./phase-r3-offline-recon.md) | + quarantine, number-gaps | R0 | planned |
| R4 | [Dashboard KPIs](./phase-r4-dashboard.md) | + dashboard | R1–R3 | planned |
| R5 | [RBAC + export + hardening + docs](./phase-r5-hardening.md) | — | R1–R4 | planned |

## Acceptance (toàn milestone)
- Mọi báo cáo chạy trên endpoint THẬT, branch-scoped, phân trang nơi cần, có loading/
  empty/error, export xlsx nơi hợp lý.
- **Doanh thu thuần đúng:** net = Σ(bill COMPLETED.totalVnd) − Σ(refund.amountVnd);
  bill CANCELLED không tính; tất cả integer VND qua helper.
- **Đối soát khớp:** variance = counted − expected; số bill thiếu phát hiện đúng theo seq.
- RBAC per-màn: reports = HQ/chủ/kế toán chuỗi + QL_CN(chi nhánh). Cashier/thủ kho không.
- TDD: e2e cho mọi endpoint tổng hợp (đúng số + branch-scope + role); FE test luồng chính.
- Không giảm coverage; build + lint + test xanh mọi package.

## Quyết định đã chốt (2026-08-02)
1. **Doanh thu thuần (R1):** `net = Σ(COMPLETED.totalVnd) − Σ(refund.amountVnd)`; bill
   CANCELLED loại; guestCount theo bill COMPLETED (kể cả vé free).
2. **Quarantine (R3):** **cho đánh dấu đã xử lý** — thêm cột `Bill.quarantineResolvedAt`/
   `quarantineResolvedBy`/`quarantineResolveNote` (migration additive) + endpoint resolve +
   audit `bill.quarantine_resolved`.
3. **Export:** **Excel (.xlsx)** — backend workbook + `api.download` (như export bảng giá).
4. **Số bill thiếu (R3):** chỉ soát **seq thiếu trong DB** theo `(chi nhánh, ngày)`
   ([min..max] đã có); không đối chiếu temp offline chưa sync ở bản này.
