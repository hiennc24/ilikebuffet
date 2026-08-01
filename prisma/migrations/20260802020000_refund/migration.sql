-- Refund: partial/full refunds against a paid bill (admin Orders screen).
CREATE TABLE "refund" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "refundedBy" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refund_billId_idx" ON "refund"("billId");

ALTER TABLE "refund" ADD CONSTRAINT "refund_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
