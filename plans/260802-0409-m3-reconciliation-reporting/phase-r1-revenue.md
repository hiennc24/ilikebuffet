# R1 — Báo cáo doanh thu (net)

**Goal:** doanh thu thuần theo ngày/chi nhánh/ca, sau hoàn tiền.

## Backend
`GET /sales/reports/revenue?from&to&branchId?&groupBy=day|branch|shift`
- Branch-scoped (chain-wide → optional branchId; QL_CN → in branchIds).
- Trả: `{ totals: { grossVnd, refundedVnd, netVnd, billCount, cancelledCount,
  guestCount }, rows: [{ key, grossVnd, refundedVnd, netVnd, billCount, guestCount }],
  byTicketType: [{ ticketTypeId, name, qty, grossVnd }] }`.
- **net = Σ(COMPLETED.totalVnd) − Σ(refund.amountVnd)** (chốt Q1); CANCELLED loại.
- Tiền qua `sumVnd` (integer). businessDate range; group theo ngày/chi nhánh/ca.
- Read-only; index dùng `(branchId, businessDate)`.

## Frontend
- `revenue-report-page.tsx`: DateRangeBar + groupBy select + KpiCard hàng (gross/refund/
  net/khách) + DataTable theo nhóm + footer tổng + byTicketType nhỏ + nút Export.

## Files
- modify reports.controller/service/dto; create e2e `sales-reports-revenue.e2e-spec.ts`
- create `apps/admin/src/pages/revenue-report-page.tsx` (+ test), route + nav

## Steps (TDD)
1. e2e/red: net = gross − refund; CANCELLED loại; group day/branch/shift; branch-scope
   denial; role gate.
2. Implement aggregate.
3. FE: filters + KPIs + table + export.

## Risks
- Refund gắn với bill (không có businessDate riêng) → quy refund về businessDate của bill
  khi group theo ngày. Đảm bảo net không âm bất thường (refund ≤ gross theo bill).
