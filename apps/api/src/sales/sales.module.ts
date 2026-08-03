/**
 * SalesModule — Ticket Types, Pricing, Discounts, Shifts, Bills, Payments.
 *
 * Imports MasterDataModule to get MasterDataService for isHoliday().
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { MasterDataModule } from "../platform/master-data/master-data.module";
import { InventoryModule } from "../inventory/inventory.module";

import { TicketTypesService } from "./ticket-types/ticket-types.service";
import { TicketTypesController } from "./ticket-types/ticket-types.controller";

import { PricingService } from "./pricing/pricing.service";
import {
  TimeWindowController,
  PriceBookVersionController,
  BranchPriceFlagController,
  PriceResolveController,
} from "./pricing/pricing.controller";

import { DiscountsService } from "./discounts/discounts.service";
import {
  DiscountProgramController,
  VoucherController,
  ApprovalPinController,
  DiscountReasonController,
} from "./discounts/discounts.controller";

import { BillNumberService } from "./bills/bill-number.service";
import { BillsService } from "./bills/bills.service";
import { BillsController } from "./bills/bills.controller";
import { SyncService } from "./bills/sync.service";
import { SyncController } from "./bills/sync.controller";
import { PaymentsService } from "./payments/payments.service";
import { PaymentsController } from "./payments/payments.controller";

import { ShiftsService } from "./shifts/shifts.service";
import { ShiftsController } from "./shifts/shifts.controller";

import { ReportsService } from "./reports/reports.service";
import { ReportsController } from "./reports/reports.controller";

@Module({
  imports: [PrismaModule, AuditModule, MasterDataModule, InventoryModule],
  controllers: [
    TicketTypesController,
    TimeWindowController,
    PriceBookVersionController,
    BranchPriceFlagController,
    PriceResolveController,
    DiscountProgramController,
    VoucherController,
    ApprovalPinController,
    DiscountReasonController,
    ShiftsController,
    BillsController,
    SyncController,
    PaymentsController,
    ReportsController,
  ],
  providers: [
    TicketTypesService,
    PricingService,
    DiscountsService,
    BillNumberService,
    ShiftsService,
    BillsService,
    SyncService,
    PaymentsService,
    ReportsService,
  ],
  exports: [TicketTypesService, PricingService, DiscountsService, BillNumberService, BillsService, SyncService, PaymentsService],
})
export class SalesModule {}
