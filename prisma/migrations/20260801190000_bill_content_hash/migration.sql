-- P8 C1: content hash for offline-sync dedup integrity. A dedup hit whose stored
-- hash differs from the resubmitted content is rejected + audited (never silently
-- returns the official number).
ALTER TABLE "bill" ADD COLUMN "contentHash" TEXT;
