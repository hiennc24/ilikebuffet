---
title: "M6 — Lãi gộp (doanh thu − giá vốn)"
slug: m6-gross-margin
created: 2026-08-03
status: done
priority: P1
mode: --tdd
---

# M6 — Lãi gộp

Mục tiêu: khép vòng tài chính — ghép **doanh thu thuần** (M3) với **giá vốn tiêu
hao ước tính** (M5) → báo cáo **lãi gộp** theo ngày/chi nhánh + xuất Excel.

**Bối cảnh (đã scout):** `sales/reports` đã có `revenue()` (net = Σ COMPLETED.total
− Σ refunds, key theo businessDate/branch/shift, có `branchWhere/dateWhere` +
ExcelJS export). M5 ghi tiêu hao vào `StockMovement` (refType `BILL`/`BILL_REVERSAL`,
`unitCostVnd`). FE có `useReport` + `DateRangeBar/TotalsBar/KpiCard`.

**Điểm mấu chốt — căn ngày:** doanh thu key theo **`bill.businessDate`**; movement
tiêu hao key theo `createdAt` (= lúc tạo bill; offline sync có thể lệch ngày). Để
lãi gộp nhất quán, **giá vốn phải quy về `businessDate` của bill** (join movement
→ bill qua `refId`). `StockMovement` không có FK tới Bill ⇒ lấy tập billId trong
kỳ (theo businessDate) rồi gộp COGS của các movement có `refId ∈` tập đó. Bill hủy:
ISSUE + REVERSAL cùng billId ⇒ COGS ròng = 0 (khớp doanh thu = 0). Offline sync:
COGS vẫn quy về businessDate gốc (đúng).

**Nguyên tắc:** read-only; branch-scoped + role-gated (REPORT_VIEW_ROLES); tiền
integer VND; COGS là **ước tính theo định mức** — ghi rõ nhãn. YAGNI/KISS/DRY.

## Phạm vi
- **Trong M6:** endpoint lãi gộp (net rev − COGS) theo day/branch + tổng + %biên;
  xuất Excel; màn báo cáo FE; docs.
- **Ngoài M6:** COGS thực tế (theo lô/giá vốn thực), phân bổ chi phí vận hành, VietQR.

## Phases

| Phase | Tên | Nội dung | Phụ thuộc | Status |
|-------|-----|----------|-----------|--------|
| G0 | [Backend lãi gộp](./phase-g0-backend.md) | `grossMargin()` service (join billId→businessDate) + endpoint + Excel export + e2e | — | ✅ done |
| G1 | [FE + docs](./phase-g1-frontend-docs.md) | màn báo cáo lãi gộp (useReport + export) + nav/route/rbac + docs + full verify | G0 | ✅ done |

## Acceptance
- Lãi gộp theo ngày/chi nhánh = doanh thu thuần − COGS ước tính, căn theo businessDate.
- Bill hủy trong kỳ: doanh thu 0 + COGS 0 (không lệch). Offline sync căn đúng ngày.
- Tổng + %biên gộp đúng; xuất Excel hợp lệ; branch-scope + role-gate.
- Toàn bộ test API/admin/shared xanh; không hồi quy báo cáo M3.
