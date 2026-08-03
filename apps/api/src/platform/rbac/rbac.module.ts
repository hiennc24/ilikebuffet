/**
 * RbacModule — provides BranchScopeGuard and exports it for global registration,
 * and serves the read-only role→capability matrix (RbacController).
 * BranchScopeGuard depends on AuditService and PrismaService.
 */
import { Module } from "@nestjs/common";
import { AuditModule } from "../../audit/audit.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { BranchScopeGuard } from "./branch-scope.guard";
import { RbacController } from "./rbac.controller";

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [RbacController],
  providers: [BranchScopeGuard],
  exports: [BranchScopeGuard],
})
export class RbacModule {}
