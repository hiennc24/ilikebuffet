# R4 — Dashboard KPIs

**Goal:** thay stub `dashboard-page` bằng KPI thật cho chủ/quản lý.

## Backend
`GET /sales/reports/dashboard?branchId?` — branch-scoped, trả nhanh:
- `todayNetVnd`, `todayBillCount`, `todayGuestCount` (business-date hôm nay, net sau refund).
- `openShiftCount`.
- `quarantineOpenCount` (bill quarantine trong N ngày gần).
- (tuỳ chọn) `last7dNetByDay: [{ date, netVnd }]` cho sparkline.

## Frontend
- Rewrite `dashboard-page.tsx`: hàng KpiCard (doanh thu hôm nay, số bill, khách, ca mở,
  quarantine) + link nhanh sang báo cáo/đối soát. Dùng R0 KpiCard.

## Files
- reports.controller/service; e2e (gộp vào sales-reports e2e)
- modify `apps/admin/src/pages/dashboard-page.tsx` (+ test)

## Steps (TDD)
1. e2e: dashboard trả đúng today net + counts, branch-scoped.
2. FE: KpiCards + links.

## Risks
- "Hôm nay" theo VN business-date (dùng toVnDateStr), không theo UTC.
- Tránh N+1: 1 vài truy vấn count/aggregate, không lặp per-bill.
