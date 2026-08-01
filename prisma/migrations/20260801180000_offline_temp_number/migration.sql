-- P8: Offline POS — add tempNumber to bill for device-issued temp number tracking.
-- The tempNumber is "[CN]-[YYMMDD]-T[DEVICE_SHORT][NNN]", stored alongside the
-- official gapless number for audit/reconciliation (C8: high-water-mark, void detection).

ALTER TABLE "bill" ADD COLUMN "tempNumber" TEXT;
