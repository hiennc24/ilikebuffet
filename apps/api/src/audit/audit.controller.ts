/**
 * AuditController — read-only audit-trail lookup for the admin Nhật ký screen.
 *
 * Insider-safe: only QUAN_TRI_HQ and QUAN_LY_CN reach it (an unguarded audit read
 * would leak sensitive history). A non-chain-wide manager is restricted to their
 * own branch(es). There is deliberately NO write/delete route here — the trail is
 * append-only (DB trigger) and this endpoint only SELECTs. The export route reuses
 * the same filter + scope and streams a filtered .xlsx (capped, newest-first).
 */
import { Controller, ForbiddenException, Get, Query, Request, Res } from "@nestjs/common";
import type { Response } from "express";
import * as ExcelJS from "exceljs";
import { AuditService, type AuditQuery, type AuditRecordView } from "./audit.service";
import { PermissionService } from "../platform/rbac/permission.service";
import type { ScopedRequest } from "../platform/rbac/branch-scope.guard";

/** Upper bound for a single export so an unfiltered pull can't be unbounded. */
const EXPORT_LIMIT = 10_000;

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
  constructor(
    private readonly audit: AuditService,
    private readonly perms: PermissionService,
  ) {}

  private async assertAccess(req: ScopedRequest) {
    if (!(await this.perms.can(req.user.role, "audit:view"))) {
      throw new ForbiddenException("Không có quyền xem nhật ký");
    }
  }

  /** Shared filter across list + export (branch-scoped; limit/offset added by caller). */
  private filterFrom(q: AuditQueryParams, req: ScopedRequest): AuditQuery {
    return {
      actorId: q.actorId,
      action: q.action,
      objectType: q.objectType,
      objectId: q.objectId,
      // Chain-wide may narrow by branchId; a branch manager is confined to their own.
      branchId: req.user.chainWide ? q.branchId : undefined,
      branchIds: req.user.chainWide ? undefined : req.user.branchIds,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(`${q.to}T23:59:59.999Z`) : undefined,
    };
  }

  @Get()
  async list(@Query() q: AuditQueryParams, @Request() req: ScopedRequest) {
    await this.assertAccess(req);
    const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(q.pageSize ?? "20", 10) || 20));

    const { data, total } = await this.audit.query({
      ...this.filterFrom(q, req),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return { data, total, page, pageSize };
  }

  @Get("export")
  async export(@Query() q: AuditQueryParams, @Request() req: ScopedRequest, @Res() res: Response) {
    await this.assertAccess(req);
    const { data } = await this.audit.query({ ...this.filterFrom(q, req), limit: EXPORT_LIMIT, offset: 0 });

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Nhật ký");
    sheet.columns = [
      { header: "Thời gian", key: "at", width: 22 },
      { header: "Người thực hiện", key: "actor", width: 20 },
      { header: "Vai trò", key: "role", width: 16 },
      { header: "Hành động", key: "action", width: 24 },
      { header: "Đối tượng", key: "object", width: 28 },
      { header: "Chi nhánh", key: "branch", width: 14 },
      { header: "Lý do", key: "reason", width: 24 },
      { header: "Người duyệt", key: "approvedBy", width: 16 },
    ];
    for (const r of data as AuditRecordView[]) {
      sheet.addRow({
        at: r.createdAt.toISOString(),
        actor: r.actorName ?? r.actorId ?? "hệ thống",
        role: r.actorRole ?? "",
        action: r.action,
        object: `${r.objectType}${r.objectId ? `:${r.objectId}` : ""}`,
        branch: r.branchId ?? "",
        reason: r.reason ?? "",
        approvedBy: r.approvedBy ?? "",
      });
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="nhat-ky-${q.from ?? ""}-${q.to ?? ""}.xlsx"`);
    res.send(buffer);
  }
}
