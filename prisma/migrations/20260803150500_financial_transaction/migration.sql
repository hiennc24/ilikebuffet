-- Income/expense entries (phiếu thu-chi) against the chart of accounts (E3).
CREATE TABLE "financial_transaction" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "flow" "AccountFlow" NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "supplierId" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_transaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_transaction_code_key" ON "financial_transaction"("code");
CREATE INDEX "financial_transaction_branchId_occurredAt_idx" ON "financial_transaction"("branchId", "occurredAt");
CREATE INDEX "financial_transaction_accountId_idx" ON "financial_transaction"("accountId");

ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
