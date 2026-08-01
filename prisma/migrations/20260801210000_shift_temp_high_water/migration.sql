-- P8 C8: high-water-mark of device-issued temp sequence, uploaded at shift close.
-- Lets reconciliation distinguish a voided/never-synced offline bill (a hole
-- below the HWM) from a bill that simply never existed.
ALTER TABLE "shift" ADD COLUMN "tempHighWater" INTEGER;
