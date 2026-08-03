# P0 — PO approval backend

**Goal:** APPROVED status + threshold-gated approval + capability enforcement.

## Schema (`prisma/schema.prisma`)
- `enum PoStatus` — add `APPROVED` (between DRAFT and SENT conceptually).
- `model PurchaseOrder` — add `approvedBy String?`, `approvedAt DateTime? @db.Timestamptz(3)`.
- `model Branch` — add `poApprovalThresholdVnd Int @default(0)` (0 = every PO needs approval; >0 = only over it).

## Migration `prisma/migrations/<ts>_po_approval/migration.sql`
- `ALTER TYPE "PoStatus" ADD VALUE 'APPROVED';` (additive — must be its own statement/tx).
- `ALTER TABLE "purchase_order" ADD COLUMN "approvedBy" TEXT, ADD COLUMN "approvedAt" TIMESTAMPTZ(3);`
- `ALTER TABLE "branch" ADD COLUMN "poApprovalThresholdVnd" INTEGER NOT NULL DEFAULT 0;`
- Apply from ROOT: `npx prisma migrate deploy --schema prisma/schema.prisma` then `npx prisma generate`.

## Capability matrix (`platform/rbac/permissions.ts` + `.spec.ts`)
- Add `purchase-order:create` to QUAN_LY_CN, QUAN_TRI_HQ, CHU_CHUOI (THU_KHO already has it) — preserves the current PO-write role set exactly.
- Add `purchase-order:approve` to QUAN_TRI_HQ, CHU_CHUOI (QUAN_LY_CN already has it). THU_KHO keeps create only → natural separation of duties.
- Update the spec's table for both capability rows.

## Service (`purchase-orders.service.ts`)
- `needsApproval(po, branch)` = `po.totalVnd > branch.poApprovalThresholdVnd`.
- `approve(id, actorId, role, access)`: load PO+branch; assert branch; status must be DRAFT; if `!needsApproval` still allow (idempotent-friendly) OR reject "không cần duyệt" — MVP: allow approving any DRAFT (sets APPROVED, approvedBy/At); audit `purchase_order.approved`.
- `reject(id, ...)`: status must be APPROVED → back to DRAFT, clear approvedBy/At; audit `purchase_order.rejected`.
- `send()` guard: if `needsApproval(po, branch)` and status !== APPROVED → 400 "Đơn cần được duyệt trước khi gửi". Allow SENT from DRAFT (under threshold) or APPROVED. Clear/keep approvedBy on send (keep, as record).
- `toView` — expose `approvedBy`, `approvedAt`, and the branch threshold is not per-PO (skip). Include `needsApproval` boolean for FE.

## Controller (`purchase-orders.controller.ts`)
- Switch write gate to capabilities via `can(role, cap)`:
  - create/update/send/cancel → `purchase-order:create`.
  - `POST :id/approve`, `POST :id/reject` → `purchase-order:approve`.
  - receive → keep INVENTORY_WRITE_ROLES (warehouse goods receipt, unchanged).
- Private `requireCap(req, cap)` throwing ForbiddenException, mirroring finance controller.

## Tests (`test/purchase-order-approval.e2e-spec.ts`)
- over-threshold PO: send before approve → 400; approve (as QUAN_LY_CN) → APPROVED; send → SENT.
- under-threshold PO (branch threshold >0): send straight DRAFT→SENT (no approval).
- reject APPROVED → DRAFT (approvedBy cleared).
- capability denials: THU_KHO cannot approve (403); a role without create cap cannot create.
- Keep existing PO e2e green (create role set unchanged).

## Verify
- `npx prisma generate`; API tsc + eslint; `test/purchase-order*.e2e-spec.ts` + permissions.spec green.
