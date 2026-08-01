/**
 * SalesModule — P6: Ticket Types, Pricing, Discounts (VG-01/02/03).
 *
 * Imports MasterDataModule to get MasterDataService for isHoliday() (Red Team M2).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { MasterDataModule } from "../platform/master-data/master-data.module";

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

@Module({
  imports: [PrismaModule, AuditModule, MasterDataModule],
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
  ],
  providers: [TicketTypesService, PricingService, DiscountsService, BillNumberService],
  exports: [TicketTypesService, PricingService, DiscountsService, BillNumberService],
})
export class SalesModule {}
