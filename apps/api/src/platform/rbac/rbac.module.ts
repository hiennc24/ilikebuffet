/**
 * RbacModule — provides BranchScopeGuard and exports it for global registration,
 * and serves the read-only role→capability matrix (RbacController).
 * BranchScopeGuard depends on AuditService and PrismaService.
 */
import { Global, Module } from "@nestjs/common";
import { AuditModule } from "../../audit/audit.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { BranchScopeGuard } from "./branch-scope.guard";
import { PermissionService } from "./permission.service";
import { RbacController } from "./rbac.controller";

// Global: PermissionService is a cross-cutting capability check used by controllers
// across every feature module (finance, inventory, reports, audit, users…).
@Global()
@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [RbacController],
  providers: [BranchScopeGuard, PermissionService],
  exports: [BranchScopeGuard, PermissionService],
})
export class RbacModule {}
