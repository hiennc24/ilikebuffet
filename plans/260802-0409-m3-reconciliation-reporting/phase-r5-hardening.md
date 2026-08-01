# R5 — RBAC + export + hardening + docs

**Goal:** khoá quyền báo cáo, hoàn thiện export, verify cross-cutting, cập nhật docs.

## RBAC per-màn (thêm vào lib/rbac.ts RESTRICTED_SCREENS)
- `/reports/revenue`, `/reports/shift-cash`, `/reports/offline`: HQ + CHU_CHUOI +
  KE_TOAN_CHUOI (chain-wide) + QUAN_LY_CN (chi nhánh mình). Cashier/thủ kho: không.
- Backend: mỗi endpoint reports role-gate (một `REPORT_VIEW_ROLES` set) + branch-scope.
- Dashboard `/`: mọi authenticated (KPI tự branch-scope theo role).

## Export
- Backend: workbook xlsx cho revenue + shift-cash (reuse mẫu audit-export nếu có), stream
  attachment; FE `api.download` → save-as. (Chốt Q3: xlsx vs CSV.)

## Verify (cross-cutting)
- e2e: RBAC denial matrix cho 5 endpoint reports (cashier/thủ kho 403).
- Số học: revenue net, variance, gaps — property-style test vài kịch bản.
- FE: mỗi báo cáo có test route-guard + luồng chính.
- Full: API unit+e2e, admin/pos/shared/ui build+test+lint xanh.

## Docs
- `docs/project-roadmap.md`: đánh dấu M3 done + M4 backlog (Kho, VietQR).
- `docs/system-architecture.md`: thêm module reports + endpoints.

## Risks
- Đảm bảo report branch-scope KHÔNG rò chi nhánh khác (test chéo CN như M1/M2).
- Export không lộ dữ liệu ngoài phạm vi role.
