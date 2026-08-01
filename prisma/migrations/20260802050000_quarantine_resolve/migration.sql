-- Reconciliation review: mark a quarantined bill as handled (GA-02).
ALTER TABLE "bill" ADD COLUMN "quarantineResolvedAt" TIMESTAMPTZ(3);
ALTER TABLE "bill" ADD COLUMN "quarantineResolvedBy" TEXT;
ALTER TABLE "bill" ADD COLUMN "quarantineResolveNote" TEXT;
