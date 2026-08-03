# P1 — PO approval frontend

**Goal:** Show approval state + approve/reject actions + branch threshold config.

## Purchase-orders page (`apps/admin/src/pages/purchase-orders-page.tsx`)
- Status column/badge: add APPROVED (distinct tone from SENT).
- Detail/row actions: when status DRAFT and PO `needsApproval` and the user holds
  `purchase-order:approve` (client rbac cap check) → "Duyệt" button → POST
  `:id/approve`. When APPROVED → "Từ chối" → POST `:id/reject`, and "Gửi NCC" enabled.
- When status DRAFT and NOT needsApproval → "Gửi NCC" enabled directly.
- Invalidate the PO list/detail query on success; surface backend error messages.

## Client RBAC cap (`apps/admin/src/lib/rbac.ts`)
- Add a lightweight capability check mirroring the server matrix for the approve
  action (either a small `canApprovePo(role)` set {QUAN_LY_CN, HQ, CHU_CHUOI} or a
  generic cap map). Keep KISS — a named set is fine; server is the real gate.

## Branch settings (`apps/admin/src/pages/branches-page.tsx`)
- Add a `poApprovalThresholdVnd` numeric field to the branch create/edit form
  (label "Ngưỡng duyệt đơn mua (VND)", helper "0 = mọi đơn cần duyệt"). Wire to the
  branch update DTO/endpoint (extend if the branch update omits it).

## Tests
- purchase-orders-page test: over-threshold DRAFT shows "Duyệt"; clicking posts to
  `:id/approve`; APPROVED shows "Gửi NCC" + "Từ chối".
- branches-page test: threshold field renders + submits (extend existing test).

## Verify
- admin vitest (touched suites) + tsc + eslint; build.
