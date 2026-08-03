/**
 * ReportsController — read-only reconciliation & reporting.
 *
 * Role-gated to chain-wide roles (HQ / owner / chain accountant) and branch
 * managers; cashiers/warehouse have no access. Branch-scoping is applied in the
 * service via BranchAccess. No write routes here (except quarantine-resolve in R3).
 */
import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Request, Res } from "@nestjs/common";
import type { Response } from "express";
import { ReportsService } from "./reports.service";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { RevenueQuery, ShiftCashQuery, QuarantineQuery, ResolveQuarantineDto, GrossMarginQuery, ChainOverviewQuery } from "./reports.dto";

export const REPORT_VIEW_ROLES = new Set<Role>([
  Role.QUAN_TRI_HQ,
  Role.CHU_CHUOI,
  Role.KE_TOAN_CHUOI,
  Role.QUAN_LY_CN,
]);

/** Chain-level roles: the whole-chain overview is not a per-branch view. */
export const CHAIN_REPORT_ROLES = new Set<Role>([Role.QUAN_TRI_HQ, Role.CHU_CHUOI, Role.KE_TOAN_CHUOI]);

@Controller("sales/reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private access(req: ScopedRequest) {
    if (!REPORT_VIEW_ROLES.has(req.user.role as Role)) {
      throw new ForbiddenException("Không có quyền xem báo cáo");
    }
    return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
  }

  private chainAccess(req: ScopedRequest) {
    if (!CHAIN_REPORT_ROLES.has(req.user.role as Role)) {
      throw new ForbiddenException("Chỉ vai trò cấp chuỗi mới xem được tổng quan chuỗi");
    }
    return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
  }

  @Get("chain-overview")
  chainOverview(@Query() query: ChainOverviewQuery, @Request() req: ScopedRequest) {
    return this.reports.chainOverview(query, this.chainAccess(req));
  }

  /** Dashboard KPIs — any authenticated admin user; branch-scoped by the token. */
  @Get("dashboard")
  dashboard(@Query("branchId") branchId: string, @Request() req: ScopedRequest) {
    return this.reports.dashboard({ chainWide: req.user.chainWide, branchIds: req.user.branchIds }, branchId || undefined);
  }

  @Get("revenue")
  revenue(@Query() query: RevenueQuery, @Request() req: ScopedRequest) {
    return this.reports.revenue(query, this.access(req));
  }

  @Get("revenue/export")
  async exportRevenue(@Query() query: RevenueQuery, @Request() req: ScopedRequest, @Res() res: Response) {
    const buffer = await this.reports.exportRevenue(query, this.access(req));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="doanh-thu-${query.from ?? ""}-${query.to ?? ""}.xlsx"`);
    res.send(buffer);
  }

  @Get("gross-margin")
  grossMargin(@Query() query: GrossMarginQuery, @Request() req: ScopedRequest) {
    return this.reports.grossMargin(query, this.access(req));
  }

  @Get("gross-margin/export")
  async exportGrossMargin(@Query() query: GrossMarginQuery, @Request() req: ScopedRequest, @Res() res: Response) {
    const buffer = await this.reports.exportGrossMargin(query, this.access(req));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="lai-gop-${query.from ?? ""}-${query.to ?? ""}.xlsx"`);
    res.send(buffer);
  }

  @Get("shift-cash")
  shiftCash(@Query() query: ShiftCashQuery, @Request() req: ScopedRequest) {
    return this.reports.shiftCash(query, this.access(req));
  }

  @Get("shift-cash/export")
  async exportShiftCash(@Query() query: ShiftCashQuery, @Request() req: ScopedRequest, @Res() res: Response) {
    const buffer = await this.reports.exportShiftCash(query, this.access(req));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="doi-soat-tien-ca-${query.from ?? ""}-${query.to ?? ""}.xlsx"`);
    res.send(buffer);
  }

  @Get("quarantine")
  quarantine(@Query() query: QuarantineQuery, @Request() req: ScopedRequest) {
    return this.reports.quarantine(query, this.access(req));
  }

  @Get("number-gaps")
  numberGaps(@Query("branchId") branchId: string, @Query("businessDate") businessDate: string, @Request() req: ScopedRequest) {
    return this.reports.numberGaps(branchId, businessDate, this.access(req));
  }

  @Post("quarantine/:billId/resolve")
  resolve(@Param("billId") billId: string, @Body() dto: ResolveQuarantineDto, @Request() req: ScopedRequest) {
    return this.reports.resolveQuarantine(billId, dto.note ?? "", req.user.sub, req.user.role, this.access(req));
  }
}
