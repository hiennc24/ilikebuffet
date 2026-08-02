/**
 * InventoryModule — purchase orders, goods receipt, stock balances, and stock
 * reports. Built on the M2 master-data foundation (ingredients, units, purchase
 * units, suppliers). BOM auto-consumption on sale is a later milestone.
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { InventoryBalanceService } from "./inventory-balance.service";
import { PurchaseOrdersService } from "./purchase-orders/purchase-orders.service";
import { PurchaseOrdersController } from "./purchase-orders/purchase-orders.controller";
import { GoodsReceiptService } from "./receipts/goods-receipt.service";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PurchaseOrdersController],
  providers: [InventoryBalanceService, PurchaseOrdersService, GoodsReceiptService],
  exports: [InventoryBalanceService],
})
export class InventoryModule {}
