-- Supplier payables (công nợ NCC) — E3. Created on goods receipt; reduced by
-- supplier payments (finance EXPENSE entries).
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PAID');

CREATE TABLE "supplier_payable" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "poId" TEXT,
    "amountVnd" INTEGER NOT NULL,
    "paidVnd" INTEGER NOT NULL DEFAULT 0,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_payable_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_payable_supplierId_status_idx" ON "supplier_payable"("supplierId", "status");
CREATE INDEX "supplier_payable_branchId_idx" ON "supplier_payable"("branchId");

ALTER TABLE "supplier_payable" ADD CONSTRAINT "supplier_payable_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payable" ADD CONSTRAINT "supplier_payable_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payable" ADD CONSTRAINT "supplier_payable_poId_fkey"
    FOREIGN KEY ("poId") REFERENCES "purchase_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
