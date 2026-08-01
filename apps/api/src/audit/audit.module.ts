import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditExportService } from "./audit-export.service";
import { AuditInterceptor } from "./audit.interceptor";

/**
 * Audit foundation. Exposes the services other modules use to append and
 * read the trail. The audit-lookup HTTP route + Excel export require RBAC
 * (only Chủ chuỗi/HQ/Kế toán may read) — shipping an unguarded
 * audit-read endpoint would leak sensitive history.
 */
@Module({
  providers: [AuditService, AuditExportService, AuditInterceptor],
  exports: [AuditService, AuditExportService, AuditInterceptor],
})
export class AuditModule {}
