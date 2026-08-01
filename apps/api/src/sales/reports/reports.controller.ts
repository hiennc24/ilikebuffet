/**
 * ReportsController — read-only reconciliation & reporting.
 *
 * Role-gated to chain-wide roles (HQ / owner / chain accountant) and branch
 * managers; cashiers/warehouse have no access. Branch-scoping is applied in the
 * service via BranchAccess. No write routes here (except quarantine-resolve in R3).
 */
import { Controller, ForbiddenException, Get, Query, Request } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { RevenueQuery } from "./reports.dto";

export const REPORT_VIEW_ROLES = new Set<Role>([
  Role.QUAN_TRI_HQ,
  Role.CHU_CHUOI,
  Role.KE_TOAN_CHUOI,
  Role.QUAN_LY_CN,
]);

@Controller("sales/reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private access(req: ScopedRequest) {
    if (!REPORT_VIEW_ROLES.has(req.user.role as Role)) {
      throw new ForbiddenException("Không có quyền xem báo cáo");
    }
    return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
  }

  @Get("revenue")
  revenue(@Query() query: RevenueQuery, @Request() req: ScopedRequest) {
    return this.reports.revenue(query, this.access(req));
  }
}
