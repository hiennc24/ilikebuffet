import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditModule } from "../../audit/audit.module";
import { MasterDataService } from "./master-data.service";
import {
  UnitController,
  IngredientGroupController,
  IngredientController,
  AccountController,
  SupplierController,
  HolidayCalendarController,
} from "./master-data.controller";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    UnitController,
    IngredientGroupController,
    IngredientController,
    AccountController,
    SupplierController,
    HolidayCalendarController,
  ],
  providers: [MasterDataService],
  exports: [MasterDataService],
})
export class MasterDataModule {}
