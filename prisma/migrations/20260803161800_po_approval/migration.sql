-- Purchase-order approval workflow: new APPROVED status, approver stamp, and a
-- per-branch approval threshold.

-- Enum value additions must be committed before they can be used; keep this
-- migration additive (no data backfill needed — existing POs keep their status).
ALTER TYPE "PoStatus" ADD VALUE 'APPROVED';

ALTER TABLE "purchase_order"
  ADD COLUMN "approvedBy" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMPTZ(3);

ALTER TABLE "branch"
  ADD COLUMN "poApprovalThresholdVnd" INTEGER NOT NULL DEFAULT 0;
