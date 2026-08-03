# V2 — Màn đối soát ngân hàng + docs

**Goal:** admin xem/đối soát giao dịch; docs; full verify.

## Backend (`sales/bank-transactions`)
- `GET /sales/bank-transactions?status&from&to&page&pageSize` — list, role chain-level.
- `POST /sales/bank-transactions/:id/match` { billId } — khớp thủ công (V1 applyPayment).
- `POST /sales/bank-transactions/:id/ignore` { note } — bỏ qua.
- Role gate: QUAN_TRI_HQ, CHU_CHUOI, KE_TOAN_CHUOI (đối soát cấp chuỗi).

## Frontend (`bank-reconcile-page.tsx`)
- List (ngày, ngân hàng, số tiền, nội dung, trạng thái, bill khớp) + lọc trạng thái.
- Drawer/hành động: với UNMATCHED → nhập số bill để khớp, hoặc bỏ qua (kèm lý do).
- Route `/reports/bank-reconcile`, nav dưới "Báo cáo & Đối soát", rbac, query-keys.
- Reuse usePagedList/DataTable/Badge/Dialog.

## Docs
- `docs/project-roadmap.md`: M8 done; backlog còn giá vốn thực, carry-overs.
- `docs/deployment-guide.md` (nếu có): thêm biến `SEPAY_API_KEY` + URL webhook
  `/webhooks/sepay`.

## Verify
- API unit+e2e xanh (không phá payments/bills). admin/shared build+test+lint xanh.

## Risks
- Khớp thủ công cũng phải guard paidAt + amount==total (dùng lại applyPayment).
- Không lộ bankAccount/secret; list không trả rawPayload cho FE (chỉ field cần).
