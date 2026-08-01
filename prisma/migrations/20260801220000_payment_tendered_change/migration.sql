-- Cash over-tender support: record cash handed over and change returned.
-- Both nullable and additive; existing exact-pay rows keep NULL.
ALTER TABLE "payment" ADD COLUMN "tenderedVnd" INTEGER;
ALTER TABLE "payment" ADD COLUMN "changeVnd" INTEGER;
