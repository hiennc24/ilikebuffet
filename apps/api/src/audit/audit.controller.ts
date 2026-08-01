/**
 * AuditController — read-only audit-trail lookup for the admin Nhật ký screen.
 *
 * Insider-safe: only QUAN_TRI_HQ and QUAN_LY_CN reach it (an unguarded audit read
 * would leak sensitive history). A non-chain-wide manager is restricted to their
 * own branch(es). There is deliberately NO write/delete route here — the trail is
 * append-only (DB trigger) and this endpoint only SELECTs.
 */
import { Controller, ForbiddenException, Get, Query, Request } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { Role } from "../platform/rbac/role.enum";
import type { ScopedRequest } from "../platform/rbac/branch-scope.guard";

const AUDIT_VIEW_ROLES = new Set<Role>([Role.QUAN_TRI_HQ, Role.QUAN_LY_CN]);

interface AuditQueryParams {
  actorId?: string;
  action?: string;
  objectType?: string;
  objectId?: string;
  branchId?: string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
}

@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(@Query() q: AuditQueryParams, @Request() req: ScopedRequest) {
    if (!AUDIT_VIEW_ROLES.has(req.user.role as Role)) {
      throw new ForbiddenException("Không có quyền xem nhật ký");
    }

    const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(q.pageSize ?? "20", 10) || 20));

    // Branch scope: chain-wide sees all (optionally filtered by branchId); a branch
    // manager is confined to their branch(es) regardless of a passed branchId.
    const branchIds = req.user.chainWide ? undefined : req.user.branchIds;

    const { data, total } = await this.audit.query({
      actorId: q.actorId,
      action: q.action,
      objectType: q.objectType,
      objectId: q.objectId,
      branchId: req.user.chainWide ? q.branchId : undefined,
      branchIds,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(`${q.to}T23:59:59.999Z`) : undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return { data, total, page, pageSize };
  }
}
