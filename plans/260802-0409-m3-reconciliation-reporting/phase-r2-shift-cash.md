# R2 — Đối soát tiền mặt theo ca

**Goal:** soát chênh lệch tiền mặt (đếm vs hệ thống) theo ca.

## Backend
`GET /sales/reports/shift-cash?from&to&branchId?`
- Branch-scoped; chỉ ca đã CLOSED (có expected/counted/variance).
- Trả rows: `{ shiftId, branchId, businessDate, openedAt, closedAt, openingCashVnd,
  expectedCashVnd, countedCashVnd, varianceVnd, varianceNote, cashRevenueVnd }` +
  totals `{ varianceVnd (tổng), shortCount, overCount }`.
- `cashRevenueVnd` = Σ payment CASH của ca (đối chiếu expected). Integer VND.

## Frontend
- `shift-cash-report-page.tsx`: DateRangeBar + DataTable (ca, ngày, expected, counted,
  **variance** tô màu ≠0) + footer tổng lệch + drawer chi tiết ca (link sang Đơn hàng
  lọc theo shiftId — reuse M2). Export.

## Files
- reports.controller/service/dto; e2e `sales-reports-shift-cash.e2e-spec.ts`
- `apps/admin/src/pages/shift-cash-report-page.tsx` (+ test), route + nav

## Steps (TDD)
1. e2e/red: variance = counted − expected; chỉ CLOSED; branch-scope; short/over count.
2. Implement.
3. FE: table + highlight + drill + export.

## Risks
- Ca chưa đóng không có counted → loại khỏi báo cáo (chỉ CLOSED). Tô màu short (âm) khác over.
