# R0 — Reporting foundation

**Goal:** shared reporting building blocks so every report screen is consistent.

## Requirements
- `KpiCard` (label + big number + optional sub) for dashboards/report headers.
- `DateRangeBar` — from/to date + branch selector (chain-wide sees a branch `<select>`
  from /branches; QL_CN locked to own branch). Reused by all report filters.
- `SummaryRow`/totals footer for tables (integer VND via formatVnd).
- `useReport(path, params)` — thin react-query wrapper for read-only report GETs
  (no pagination by default; report endpoints return a computed object).
- Export button helper (wraps `api.download` → xlsx blob → save-as).
- Sales reporting module scaffold on the API: `sales/reports/` (controller + service),
  registered in SalesModule. Branch-scope helper reused (assertBranchAccess / in).

## Files
- create `apps/admin/src/pages/_shared/report-ui.tsx` (KpiCard, DateRangeBar, SummaryRow)
- create `apps/admin/src/lib/use-report.ts`, extend query-keys
- create `apps/api/src/sales/reports/{reports.module,controller,service,dto}.ts` (empty scaffold)
- modify `apps/api/src/sales/sales.module.ts`

## Tests
- report-ui component tests (KpiCard renders; DateRangeBar emits changes).
- reports.controller smoke (module wires up; a health/no-op route or first R1 endpoint).

## Risks
- Don't duplicate DataTable/FilterBar (reuse M2 primitives); report-ui only adds the
  report-specific bits (KPI, date-range, totals).
