# P2 — Chi nhánh (Branches)

**Goal:** màn quản lý chi nhánh. Backend đã đủ — UI only.

## Backend (done)
`branch.controller`: `GET /branches` (list, `{data,total}`), `GET /branches/:id`,
`POST /branches`, `PUT /branches/:id`, `PATCH /branches/:id/status`.

## Frontend
- `branches-page.tsx`: DataTable (mã, tên, địa chỉ, SĐT, trạng thái) + tạo/sửa dialog +
  toggle trạng thái (ACTIVE/INACTIVE) via PATCH status.
- Chỉ `QUAN_TRI_HQ` (chain-wide) thấy màn này (RBAC P6; stub check ở đây).
- Validate form theo `branch.dto` (mã duy nhất, required fields).

## Files
- create `apps/admin/src/pages/branches-page.tsx` (+ test)
- reuse P0 DataTable/FilterBar/DetailDrawer, `_shared/admin-ui` Select/InlineError

## Steps (TDD)
1. FE test: list renders from `{data}`; create/edit submit hits correct endpoint;
   status toggle calls PATCH; error surfaces InlineError.
2. Implement page.

## Tests
- `branches-page.test.tsx`: list, create, edit, status toggle, validation error.

## Risks
- Đổi trạng thái INACTIVE chi nhánh đang có ca mở? — chỉ toggle cờ; không cascade.
  Hiển thị cảnh báo, không tự đóng ca.
