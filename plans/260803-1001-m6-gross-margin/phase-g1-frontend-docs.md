# G1 — FE báo cáo lãi gộp + docs

**Goal:** màn báo cáo lãi gộp + xuất Excel; docs; full verify.

## Frontend (`gross-margin-report-page.tsx`)
- Mirror `revenue-report-page`: `useReport` → `/sales/reports/gross-margin`;
  `DateRangeBar` (branch cho chain-wide) + groupBy day/branch; `KpiRow`
  (doanh thu thuần, giá vốn, lãi gộp, %biên) + `DataTable` rows + nút Xuất Excel
  (`api.download` `/gross-margin/export`).
- Nhãn rõ "giá vốn ước tính theo định mức".
- Route `/reports/gross-margin`, nav dưới "Báo cáo & Đối soát", rbac entry,
  query-keys `grossMarginReport`.

## Tests (vitest)
- Render KPI + rows từ mock; đổi groupBy gọi lại đúng param; nút export gọi download.

## Docs
- `docs/project-roadmap.md`: M6 done; backlog còn định mức theo CN, VietQR, COGS thực.

## Verify (cross-cutting)
- API unit+e2e xanh (không hồi quy reports M3).
- admin/shared build+test+lint xanh.

## Risks
- RBAC path mới thêm vào `RESTRICTED_SCREENS` + nav filter (giống revenue).
