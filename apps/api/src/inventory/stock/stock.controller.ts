/**
 * StockController — on-hand balances, movement history, and manual issue/adjust
 * under /inventory/stock and /inventory/movements. Branch-scoped (no @Unscoped):
 * BranchScopeGuard enforces membership when a branchId travels in the query/body.
 *
 * Read gate: inventory:read. Issue/adjust gate: inventory:manage.
 */
import { Body, Controller, ForbiddenException, Get, Post, Query, Request } from "@nestjs/common";
import { StockService } from "./stock.service";
import { PermissionService } from "../../platform/rbac/permission.service";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import { StockListQuery, MovementListQuery, IssueStockDto, AdjustStockDto } from "./stock.dto";

@Controller("inventory")
export class StockController {
  constructor(
    private readonly service: StockService,
    private readonly perms: PermissionService,
  ) {}

  @Get("stock")
  async listStock(@Query() query: StockListQuery, @Request() req: ScopedRequest) {
    await this.assertView(req);
    return this.service.listStock(query, access(req));
  }

  @Get("movements")
  async listMovements(@Query() query: MovementListQuery, @Request() req: ScopedRequest) {
    await this.assertView(req);
    return this.service.listMovements(query, access(req));
  }

  @Post("stock/issue")
  async issue(@Body() dto: IssueStockDto, @Request() req: ScopedRequest) {
    await this.assertWrite(req);
    return this.service.issue(dto, req.user.sub, req.user.role, access(req));
  }

  @Post("stock/adjust")
  async adjust(@Body() dto: AdjustStockDto, @Request() req: ScopedRequest) {
    await this.assertWrite(req);
    return this.service.adjust(dto, req.user.sub, req.user.role, access(req));
  }

  private async assertView(req: ScopedRequest) {
    if (!(await this.perms.can(req.user.role, "inventory:read"))) {
      throw new ForbiddenException("Không có quyền xem kho");
    }
  }

  private async assertWrite(req: ScopedRequest) {
    if (!(await this.perms.can(req.user.role, "inventory:manage"))) {
      throw new ForbiddenException("Không có quyền thao tác kho");
    }
  }
}

function access(req: ScopedRequest) {
  return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
}
