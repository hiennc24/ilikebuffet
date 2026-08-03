# P2 — Công nợ aging backend

**Goal:** Supplier-debt aging buckets + due-soon/overdue + xlsx.

## Service (`sales/finance/finance.service.ts`)
- `payableAging(query, access)` — branch-scoped OPEN payables (outstanding > 0),
  grouped by supplier. For each payable bucket its outstanding by age of dueDate vs
  today (VN date, integer VND):
  - `notDueVnd` — no dueDate OR dueDate ≥ today (chưa đến hạn).
  - `d1_30Vnd` — 1–30 days overdue.
  - `d31_60Vnd` — 31–60 days overdue.
  - `d60plusVnd` — > 60 days overdue.
  - per-supplier `totalOutstandingVnd` + grand totals across suppliers.
  - resolve supplier names via a map query (Shift scalar-FK convention).
- `dueSoon(query, access)` — OPEN payables with dueDate within [today, today+7] OR
  already overdue; return supplier, outstanding, dueDate, daysOverdue (neg = còn hạn).
- `exportPayableAging(query, access)` — ExcelJS: supplier rows (buckets) + totals line.

## DTO (`finance.dto.ts`)
- `PayableAgingQuery { branchId?; supplierId? }`. Reuse for due-soon.

## Controller (`finance.controller.ts`)
- `GET /sales/finance/payables/aging` (cash:read) → payableAging.
- `GET /sales/finance/payables/aging/export` (cash:read) → xlsx.
- `GET /sales/finance/payables/due-soon` (cash:read) → dueSoon.

## Tests (`test/finance-aging.e2e-spec.ts`)
- Seed payables with dueDates at different ages (today, -15d, -45d, -90d, +3d, none).
- Assert bucketing + per-supplier + grand totals; due-soon returns the ≤7d/overdue set.
- Branch-scope confinement; xlsx buffer "PK".

## Verify
- API tsc + eslint; `test/finance-aging.e2e-spec.ts` green; existing finance e2e green.

## Notes
- Aging is derived purely from SupplierPayable (no schema change). Age uses dueDate;
  payables with no dueDate count as not-due (debtTerms 0 → due on receipt handled by
  the receipt writing dueDate = receipt date, so those show as overdue same-day).
