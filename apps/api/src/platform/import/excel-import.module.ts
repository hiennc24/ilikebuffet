import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ExcelImportService } from "./excel-import.service";
import { ImportController } from "./import.controller";

@Module({
  imports: [PrismaModule],
  controllers: [ImportController],
  providers: [ExcelImportService],
  exports: [ExcelImportService],
})
export class ExcelImportModule {}
