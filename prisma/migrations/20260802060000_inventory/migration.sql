-- Inventory: purchase orders, stock movements, and per-branch balances.
-- Money is integer VND; quantities are Decimal in the ingredient's base unit.

-- CreateEnum
CREATE TYPE "PoStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'CANCELLED');
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'ADJUST');

-- CreateTable: purchase_order
CREATE TABLE "purchase_order" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PoStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_order_code_key" ON "purchase_order"("code");
CREATE INDEX "purchase_order_branchId_status_idx" ON "purchase_order"("branchId", "status");
CREATE INDEX "purchase_order_supplierId_idx" ON "purchase_order"("supplierId");

ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: purchase_order_line
CREATE TABLE "purchase_order_line" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitPriceVnd" INTEGER NOT NULL,
    "lineTotalVnd" INTEGER NOT NULL,
    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_order_line_poId_idx" ON "purchase_order_line"("poId");

ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_poId_fkey"
    FOREIGN KEY ("poId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: stock_movement
CREATE TABLE "stock_movement" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "qtyBase" DECIMAL(12,3) NOT NULL,
    "unitCostVnd" INTEGER,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_movement_branchId_ingredientId_createdAt_idx"
    ON "stock_movement"("branchId", "ingredientId", "createdAt");

ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: inventory_balance
CREATE TABLE "inventory_balance" (
    "branchId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyBase" DECIMAL(12,3) NOT NULL,
    "avgCostVnd" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "inventory_balance_pkey" PRIMARY KEY ("branchId", "ingredientId")
);

CREATE INDEX "inventory_balance_branchId_idx" ON "inventory_balance"("branchId");

ALTER TABLE "inventory_balance" ADD CONSTRAINT "inventory_balance_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balance" ADD CONSTRAINT "inventory_balance_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
