/**
 * SalesModule — P6: Ticket Types, Pricing, Discounts (VG-01/02/03).
 *               P7: Shifts, Bills, Payments (BH-01→04, BH-06, BH-07).
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
import { BillsService } from "./bills/bills.service";
import { BillsController } from "./bills/bills.controller";
import { PaymentsService } from "./payments/payments.service";
import { PaymentsController } from "./payments/payments.controller";

import { ShiftsService } from "./shifts/shifts.service";
import { ShiftsController } from "./shifts/shifts.controller";

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
    ShiftsController,
    BillsController,
    PaymentsController,
  ],
  providers: [
    TicketTypesService,
    PricingService,
    DiscountsService,
    BillNumberService,
    ShiftsService,
    BillsService,
    PaymentsService,
  ],
  exports: [TicketTypesService, PricingService, DiscountsService, BillNumberService, BillsService, PaymentsService],
})
export class SalesModule {}
