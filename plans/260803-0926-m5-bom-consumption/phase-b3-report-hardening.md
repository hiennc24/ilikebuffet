# B3 — Báo cáo tiêu hao/giá vốn + docs

**Goal:** báo cáo nguyên liệu tiêu hao theo kỳ + giá vốn; docs; full verify.

## Backend
- `GET /inventory/reports/consumption?branchId&from&to` — gộp movement ISSUE
  refType "BILL" (trừ BILL_REVERSAL) theo ingredient: Σ qty tiêu hao + giá vốn
  = Σ roundVnd(qty × unitCostVnd của movement). Branch-scoped, view roles.
  Trả tổng cogsVnd (giá vốn hàng bán ước tính) + theo nhóm/ingredient.

## Frontend
- Bổ sung KPI/thẻ "Giá vốn tiêu hao kỳ" vào màn báo cáo kho (hoặc report page),
  reuse report-ui + DateRangeBar.

## Docs
- `docs/project-roadmap.md`: M5 done; backlog còn định mức theo CN, lãi gộp (M6), VietQR.

## Verify (cross-cutting)
- API unit+e2e toàn bộ xanh (đặc biệt bills/sync không hồi quy).
- admin/shared build+test+lint xanh.
- `balance == Σ movements`; consumption report khớp ledger.

## Risks
- COGS ước tính (theo định mức), không phải thực tế — nêu rõ trong nhãn báo cáo.
