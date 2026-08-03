-- Inter-branch stock transfer (M10). Header + lines; the two stock legs reuse
-- stock_movement (refType "TRANSFER").
CREATE TABLE "stock_transfer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_transfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_transfer_code_key" ON "stock_transfer"("code");
CREATE INDEX "stock_transfer_fromBranchId_idx" ON "stock_transfer"("fromBranchId");
CREATE INDEX "stock_transfer_toBranchId_idx" ON "stock_transfer"("toBranchId");

ALTER TABLE "stock_transfer" ADD CONSTRAINT "stock_transfer_fromBranchId_fkey"
    FOREIGN KEY ("fromBranchId") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfer" ADD CONSTRAINT "stock_transfer_toBranchId_fkey"
    FOREIGN KEY ("toBranchId") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "stock_transfer_line" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyBase" DECIMAL(12,3) NOT NULL,
    "unitCostVnd" INTEGER NOT NULL,
    CONSTRAINT "stock_transfer_line_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_transfer_line_transferId_idx" ON "stock_transfer_line"("transferId");

ALTER TABLE "stock_transfer_line" ADD CONSTRAINT "stock_transfer_line_transferId_fkey"
    FOREIGN KEY ("transferId") REFERENCES "stock_transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_transfer_line" ADD CONSTRAINT "stock_transfer_line_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
