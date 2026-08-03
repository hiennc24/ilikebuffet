-- Inbound bank transfers (Sepay webhook) for VietQR auto-reconcile.
CREATE TYPE "BankTxStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

CREATE TABLE "bank_transaction" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'sepay',
    "providerTxId" TEXT NOT NULL,
    "gateway" TEXT,
    "accountNumber" TEXT,
    "amountVnd" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "referenceCode" TEXT,
    "transferredAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "BankTxStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedBillId" TEXT,
    "branchId" TEXT,
    "note" TEXT,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_transaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_transaction_provider_providerTxId_key"
    ON "bank_transaction"("provider", "providerTxId");
CREATE INDEX "bank_transaction_status_receivedAt_idx"
    ON "bank_transaction"("status", "receivedAt");

ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_matchedBillId_fkey"
    FOREIGN KEY ("matchedBillId") REFERENCES "bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
