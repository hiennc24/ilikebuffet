/**
 * InventoryModule — purchase orders, goods receipt, stock balances, and stock
 * reports. Built on the M2 master-data foundation (ingredients, units, purchase
 * units, suppliers). BOM auto-consumption on sale is a later milestone.
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { InventoryBalanceService } from "./inventory-balance.service";

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [InventoryBalanceService],
  exports: [InventoryBalanceService],
})
export class InventoryModule {}
