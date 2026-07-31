import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditModule } from "../../audit/audit.module";
import { BranchService } from "./branch.service";
import { BranchController } from "./branch.controller";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [BranchController],
  providers: [BranchService],
  exports: [BranchService],
})
export class BranchModule {}
