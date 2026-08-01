# R3 — Đối soát offline (quarantine + lỗ hổng số bill)

**Goal:** soát bill quarantine (bất thường offline) + phát hiện lỗ hổng số bill (seq thiếu).

## Backend
- `GET /sales/reports/quarantine?from&to&branchId?&page&pageSize` — list bill
  `quarantined=true` (số bill, temp, lý do, tổng, ngày, chi nhánh). Branch-scoped, phân trang.
- `GET /sales/reports/number-gaps?branchId&businessDate` — với `(branch, businessDate)`:
  lấy MIN..MAX seq đã có, trả các seq **thiếu** (holes) trong khoảng (chốt Q4: chỉ soát
  DB, không đối chiếu temp offline chưa sync ở bản này).
- (Q2) Nếu chốt cho đánh dấu đã xử lý: `POST /sales/reports/quarantine/:billId/resolve`
  { note } → set cờ + audit `bill.quarantine_resolved`. Mặc định: **read-only**.

## Frontend
- `offline-recon-page.tsx`: 2 phần —
  (1) Quarantine: DataTable + drawer chi tiết (reason) [+ nút "Đã xử lý" nếu Q2 = write].
  (2) Số bill thiếu: chọn chi nhánh + ngày → hiện danh sách seq thiếu (cảnh báo nếu có).

## Files
- reports.controller/service/dto; e2e `sales-reports-offline.e2e-spec.ts`
- `apps/admin/src/pages/offline-recon-page.tsx` (+ test), route + nav

## Steps (TDD)
1. e2e/red: quarantine list branch-scoped; number-gaps phát hiện đúng seq thiếu (seed
   bill có seq 1,2,4 → thiếu 3); role gate.
2. Implement.
3. FE: 2 phần + drawer.

## Risks
- Gaps chỉ có nghĩa trong cùng `(branch, businessDate)` (seq reset mỗi ngày). Không cảnh báo
  nhầm khi seq bắt đầu > 1 (chưa có bill nào). Nếu Q2 = write → giữ append-only cho audit.
