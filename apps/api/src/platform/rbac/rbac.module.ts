/**
 * RbacModule — provides BranchScopeGuard and exports it for global registration.
 * BranchScopeGuard depends on AuditService and PrismaService.
 */
import { Module } from "@nestjs/common";
import { AuditModule } from "../../audit/audit.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { BranchScopeGuard } from "./branch-scope.guard";

@Module({
  imports: [AuditModule, PrismaModule],
  providers: [BranchScopeGuard],
  exports: [BranchScopeGuard],
})
export class RbacModule {}
