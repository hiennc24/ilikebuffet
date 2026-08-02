# W4 — Báo cáo kho + RBAC + hardening + docs

**Goal:** báo cáo giá trị tồn/nhập-xuất, tồn thấp trên dashboard, khoá quyền, docs.

## Backend
- `GET /inventory/reports/valuation?branchId` — tổng giá trị tồn (Σ qty×avgCost) theo
  chi nhánh / nhóm nguyên liệu. Role-gated + branch-scoped.
- (tuỳ) `GET /inventory/reports/movements-summary?from&to` — tổng nhập/xuất kỳ.
- Dashboard KPI mở rộng: `lowStockCount` (tồn thấp) — thêm vào `/sales/reports/dashboard`
  hoặc endpoint kho riêng cho card.

## RBAC (thêm vào lib/rbac.ts RESTRICTED_SCREENS + backend role sets)
- Kho (PO/nhập/tồn/báo cáo): `THU_KHO` + `QUAN_TRI_HQ` + `CHU_CHUOI` + `QUAN_LY_CN`
  (theo chi nhánh). Thu ngân/kế toán-chuỗi tuỳ nhu cầu (mặc định kế toán xem báo cáo tồn).
- Backend: `INVENTORY_ROLES` / `INVENTORY_VIEW_ROLES` sets; branch-scope mọi endpoint.

## Verify (cross-cutting)
- e2e: RBAC denial matrix cho endpoint kho (cashier 403); balance == Σ movements sau chuỗi
  PO→nhập→xuất→điều chỉnh (property-style).
- FE: mỗi màn route-guard + luồng chính.
- Full: API unit+e2e, admin/pos/shared/ui build+test+lint xanh.

## Docs
- `docs/project-roadmap.md`: M4 done + M5 (BOM/tự trừ kho khi bán) + VietQR.
- `docs/system-architecture.md`: module inventory + luồng PO→movement→balance.

## Risks
- Đảm bảo không rò chi nhánh khác (test chéo CN). Báo cáo tồn không lộ dữ liệu ngoài phạm vi.
