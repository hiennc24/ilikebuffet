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
import { PermissionService } from "../../platform/rbac/permission.service";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { RevenueQuery, ShiftCashQuery, QuarantineQuery, ResolveQuarantineDto, GrossMarginQuery, PnlQuery, ChainOverviewQuery } from "./reports.dto";

@Controller("sales/reports")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly perms: PermissionService,
  ) {}

  private async access(req: ScopedRequest) {
    if (!(await this.perms.can(req.user.role, "report:view"))) {
      throw new ForbiddenException("Không có quyền xem báo cáo");
    }
    return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
  }

  private async chainAccess(req: ScopedRequest) {
    if (!(await this.perms.can(req.user.role, "report:chain-view"))) {
      throw new ForbiddenException("Chỉ vai trò cấp chuỗi mới xem được tổng quan chuỗi");
    }
    return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
  }

  @Get("chain-overview")
  async chainOverview(@Query() query: ChainOverviewQuery, @Request() req: ScopedRequest) {
    return this.reports.chainOverview(query, await this.chainAccess(req));
  }

  @Get("chain-overview/export")
  async exportChainOverview(@Query() query: ChainOverviewQuery, @Request() req: ScopedRequest, @Res() res: Response) {
    const buffer = await this.reports.exportChainOverview(query, await this.chainAccess(req));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="tong-quan-chuoi-${query.from ?? ""}-${query.to ?? ""}.xlsx"`);
    res.send(buffer);
  }

  /** Dashboard KPIs — any authenticated admin user; branch-scoped by the token. */
  @Get("dashboard")
  dashboard(@Query("branchId") branchId: string, @Request() req: ScopedRequest) {
    return this.reports.dashboard({ chainWide: req.user.chainWide, branchIds: req.user.branchIds }, branchId || undefined);
  }

  @Get("revenue")
  async revenue(@Query() query: RevenueQuery, @Request() req: ScopedRequest) {
    return this.reports.revenue(query, await this.access(req));
  }

  @Get("revenue/export")
  async exportRevenue(@Query() query: RevenueQuery, @Request() req: ScopedRequest, @Res() res: Response) {
    const buffer = await this.reports.exportRevenue(query, await this.access(req));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="doanh-thu-${query.from ?? ""}-${query.to ?? ""}.xlsx"`);
    res.send(buffer);
  }

  @Get("gross-margin")
  async grossMargin(@Query() query: GrossMarginQuery, @Request() req: ScopedRequest) {
    return this.reports.grossMargin(query, await this.access(req));
  }

  @Get("gross-margin/export")
  async exportGrossMargin(@Query() query: GrossMarginQuery, @Request() req: ScopedRequest, @Res() res: Response) {
    const buffer = await this.reports.exportGrossMargin(query, await this.access(req));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="lai-gop-${query.from ?? ""}-${query.to ?? ""}.xlsx"`);
    res.send(buffer);
  }

  @Get("pnl")
  async pnl(@Query() query: PnlQuery, @Request() req: ScopedRequest) {
    return this.reports.pnl(query, await this.access(req));
  }

  @Get("pnl/export")
  async exportPnl(@Query() query: PnlQuery, @Request() req: ScopedRequest, @Res() res: Response) {
    const buffer = await this.reports.exportPnl(query, await this.access(req));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="lai-lo-${query.from ?? ""}-${query.to ?? ""}.xlsx"`);
    res.send(buffer);
  }

  @Get("shift-cash")
  async shiftCash(@Query() query: ShiftCashQuery, @Request() req: ScopedRequest) {
    return this.reports.shiftCash(query, await this.access(req));
  }

  @Get("shift-cash/export")
  async exportShiftCash(@Query() query: ShiftCashQuery, @Request() req: ScopedRequest, @Res() res: Response) {
    const buffer = await this.reports.exportShiftCash(query, await this.access(req));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="doi-soat-tien-ca-${query.from ?? ""}-${query.to ?? ""}.xlsx"`);
    res.send(buffer);
  }

  @Get("quarantine")
  async quarantine(@Query() query: QuarantineQuery, @Request() req: ScopedRequest) {
    return this.reports.quarantine(query, await this.access(req));
  }

  @Get("number-gaps")
  async numberGaps(@Query("branchId") branchId: string, @Query("businessDate") businessDate: string, @Request() req: ScopedRequest) {
    return this.reports.numberGaps(branchId, businessDate, await this.access(req));
  }

  @Post("quarantine/:billId/resolve")
  async resolve(@Param("billId") billId: string, @Body() dto: ResolveQuarantineDto, @Request() req: ScopedRequest) {
    return this.reports.resolveQuarantine(billId, dto.note ?? "", req.user.sub, req.user.role, await this.access(req));
  }
}
