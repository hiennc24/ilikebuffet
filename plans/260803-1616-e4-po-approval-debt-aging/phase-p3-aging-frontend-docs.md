# P3 — Aging frontend + docs

**Goal:** Aging report screen + due-soon list + Excel; docs; full verify.

## Frontend (`apps/admin/src/pages/supplier-aging-page.tsx`)
- KPIs: tổng công nợ / quá hạn / sắp đến hạn (≤7d).
- Aging table by supplier: NCC | Chưa đến hạn | 1-30 | 31-60 | 60+ | Tổng nợ, totals row.
- "Sắp/đã đến hạn" section: due-soon list (supplier, còn nợ, hạn, số ngày quá hạn — Badge warn).
- Export Excel via `/sales/finance/payables/aging/export`.
- Reuse `useReport`, report-ui (KpiCard/KpiRow/TotalsBar/DataTable). Branch filter for chain roles.

## Wiring
- Route `/finance/aging` in `app.tsx` under RequireAccess; `rbac.ts` entry
  {QUAN_TRI_HQ, CHU_CHUOI, KE_TOAN_CHUOI, QUAN_LY_CN} (same as other finance screens).
- Nav item "Tuổi nợ NCC" under the finance/reports group in `admin-shell.tsx`.
- `query-keys.ts`: `payableAging`, `payableDueSoon`.

## Tests (`supplier-aging-page.test.tsx`)
- Mock aging + due-soon; assert bucket columns + totals + a due-soon row render.

## Docs
- `docs/project-roadmap.md`: E4 done (PO approval + aging); trim backlog.
- `docs/system-architecture.md`: PO approval flow (DRAFT→APPROVED→SENT, threshold,
  capability gate) + aging in the finance module notes.

## Verify (full)
- API tsc + eslint + full suite `--runInBand` (expect known branch-scope flake only).
- admin full vitest + tsc + eslint + build.
- Update plan.md status → done; commit each phase; report + offer to push.
