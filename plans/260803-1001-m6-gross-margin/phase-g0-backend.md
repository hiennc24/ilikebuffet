# G0 — Backend lãi gộp

**Goal:** endpoint lãi gộp = doanh thu thuần − giá vốn tiêu hao, căn businessDate.

## Service (`sales/reports/reports.service.ts` — thêm `grossMargin`)
- Input: { from, to, branchId, groupBy: "day" | "branch" }.
- Doanh thu: fetch bills trong kỳ (branchWhere + dateWhere theo businessDate);
  net per key = Σ COMPLETED.total − Σ refunds (như `revenue()`). Thu tập billId.
- COGS: `stockMovement.findMany({ refType in [BILL, BILL_REVERSAL], refId in billIds })`;
  map refId → key (businessDate/branch của bill); cogs per key =
  −Σ roundVnd(qtyBase × cost) (cost = `unitCostVnd ?? 0`, biến không đặt tên tiền
  để tránh lint money). Bill hủy tự ròng 0.
- Kết hợp: mỗi key → { key, netRevenueVnd, cogsVnd, grossProfitVnd = net − cogs,
  marginPct = rev>0 ? profit/rev×100 : 0 } (biến `profit/rev` không tên tiền).
- Totals: Σ net, Σ cogs, Σ profit, marginPct tổng.

## Export
- `exportGrossMargin()` → ExcelJS (mirror `exportRevenue`): cột key, doanh thu
  thuần, giá vốn, lãi gộp, %biên + dòng tổng.

## Controller (`reports.controller.ts`)
- `GET /sales/reports/gross-margin` + `GET /sales/reports/gross-margin/export`
  (Content-Disposition xlsx). Dùng `this.access(req)` (REPORT_VIEW_ROLES).
- DTO `GrossMarginQuery { from?, to?, branchId?, groupBy? }`.

## Tests (e2e, reuse AppModule/seed pattern như sales-reports-revenue)
- Doanh thu − COGS đúng theo ngày; %biên đúng.
- Bill hủy trong kỳ: net 0 + cogs 0 (không lệch lãi gộp).
- Branch-scope: caller ngoài phạm vi không thấy dữ liệu CN khác.
- Loại vé không định mức: cogs 0, lãi gộp = doanh thu.

## Risks
- Lint money: đặt biến `cost/rev/profit` (không chứa amount|price|total|vnd|…).
- Không sửa `revenue()` cũ (tránh hồi quy M3).
