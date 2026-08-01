-- P8 H5/H3: record device clock + skew on offline bills, and a quarantine flag
-- for bills accepted-but-flagged (clock skew beyond tolerance, force-closed stuck
-- bills). The sale is never rejected — quarantine routes it to accounting review.
ALTER TABLE "bill" ADD COLUMN "deviceClockAt" TIMESTAMPTZ(3);
ALTER TABLE "bill" ADD COLUMN "clockOffsetMs" INTEGER;
ALTER TABLE "bill" ADD COLUMN "quarantined" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bill" ADD COLUMN "quarantineReason" TEXT;
