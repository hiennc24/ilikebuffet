-- Sales core: shifts, gapless bill numbering, bills, bill lines, payments.
-- Only the P7 additions are included here; pre-existing partial-unique indexes
-- (price_cell, holiday) and other hand-authored divergences are intentionally
-- left untouched (managed drift, excluded by scripts/check-migration-drift.sh).

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'FORCE_CLOSED');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'VIETQR', 'CARD');

-- CreateTable
CREATE TABLE "shift" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openedBy" TEXT NOT NULL,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingCashVnd" INTEGER NOT NULL,
    "closedBy" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "expectedCashVnd" INTEGER,
    "countedCashVnd" INTEGER,
    "varianceVnd" INTEGER,
    "varianceNote" TEXT,
    "forceClosedBy" TEXT,

    CONSTRAINT "shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_counter" (
    "branchId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "lastNo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bill_counter_pkey" PRIMARY KEY ("branchId","businessDate")
);

-- CreateTable
CREATE TABLE "bill" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "branchId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMPTZ(3),
    "totalVnd" INTEGER NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "clientUuid" TEXT,
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "cancelApprovedBy" TEXT,

    CONSTRAINT "bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_line" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "ticketTypeName" TEXT NOT NULL,
    "unitPriceVnd" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "lineTotalVnd" INTEGER NOT NULL,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "timeWindowId" TEXT,
    "timeWindowName" TEXT,
    "dayType" VARCHAR(20),
    "priceVersionId" TEXT,

    CONSTRAINT "bill_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_branchId_businessDate_idx" ON "shift"("branchId", "businessDate");

-- CreateIndex
CREATE INDEX "shift_deviceId_status_idx" ON "shift"("deviceId", "status");

-- CreateIndex: at most one OPEN shift per device (BH-01). Prisma cannot express a
-- partial unique, so it is authored here (same pattern as holiday_partial_unique).
CREATE UNIQUE INDEX "shift_one_open_per_device" ON "shift"("deviceId") WHERE "status" = 'OPEN';

-- CreateIndex
CREATE UNIQUE INDEX "bill_number_key" ON "bill"("number");

-- CreateIndex
CREATE INDEX "bill_shiftId_idx" ON "bill"("shiftId");

-- CreateIndex
CREATE INDEX "bill_branchId_businessDate_idx" ON "bill"("branchId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "bill_branchId_businessDate_seq_key" ON "bill"("branchId", "businessDate", "seq");

-- CreateIndex: offline dedup key. clientUuid is nullable; Postgres treats NULLs as
-- distinct, so online bills (clientUuid IS NULL) never collide here (P8 uses it).
CREATE UNIQUE INDEX "bill_deviceId_clientUuid_key" ON "bill"("deviceId", "clientUuid");

-- CreateIndex
CREATE INDEX "bill_line_billId_idx" ON "bill_line"("billId");

-- CreateIndex
CREATE INDEX "payment_billId_idx" ON "payment"("billId");

-- AddForeignKey
ALTER TABLE "bill" ADD CONSTRAINT "bill_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
