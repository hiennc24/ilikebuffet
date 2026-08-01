import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditExportService } from "./audit-export.service";
import { AuditInterceptor } from "./audit.interceptor";
import { AuditController } from "./audit.controller";

/**
 * Audit foundation. Exposes the services other modules use to append and
 * read the trail. The audit-lookup HTTP route is RBAC-gated (HQ + branch
 * manager, branch-scoped) — shipping an unguarded audit-read endpoint would
 * leak sensitive history. The trail is append-only; this module exposes no
 * write/delete route.
 */
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditExportService, AuditInterceptor],
  exports: [AuditService, AuditExportService, AuditInterceptor],
})
export class AuditModule {}
