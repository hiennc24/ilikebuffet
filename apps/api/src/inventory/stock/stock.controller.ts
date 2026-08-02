/**
 * StockController — on-hand balances, movement history, and manual issue/adjust
 * under /inventory/stock and /inventory/movements. Branch-scoped (no @Unscoped):
 * BranchScopeGuard enforces membership when a branchId travels in the query/body.
 *
 * Read gate: INVENTORY_VIEW_ROLES. Issue/adjust gate: INVENTORY_WRITE_ROLES.
 */
import { Body, Controller, ForbiddenException, Get, Post, Query, Request } from "@nestjs/common";
import { StockService } from "./stock.service";
import { INVENTORY_VIEW_ROLES, INVENTORY_WRITE_ROLES } from "../inventory-roles";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { StockListQuery, MovementListQuery, IssueStockDto, AdjustStockDto } from "./stock.dto";

@Controller("inventory")
export class StockController {
  constructor(private readonly service: StockService) {}

  @Get("stock")
  listStock(@Query() query: StockListQuery, @Request() req: ScopedRequest) {
    assertView(req);
    return this.service.listStock(query, access(req));
  }

  @Get("movements")
  listMovements(@Query() query: MovementListQuery, @Request() req: ScopedRequest) {
    assertView(req);
    return this.service.listMovements(query, access(req));
  }

  @Post("stock/issue")
  issue(@Body() dto: IssueStockDto, @Request() req: ScopedRequest) {
    assertWrite(req);
    return this.service.issue(dto, req.user.sub, req.user.role, access(req));
  }

  @Post("stock/adjust")
  adjust(@Body() dto: AdjustStockDto, @Request() req: ScopedRequest) {
    assertWrite(req);
    return this.service.adjust(dto, req.user.sub, req.user.role, access(req));
  }
}

function access(req: ScopedRequest) {
  return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
}

function assertView(req: ScopedRequest) {
  if (!INVENTORY_VIEW_ROLES.has(req.user.role as Role)) {
    throw new ForbiddenException("Không có quyền xem kho");
  }
}

function assertWrite(req: ScopedRequest) {
  if (!INVENTORY_WRITE_ROLES.has(req.user.role as Role)) {
    throw new ForbiddenException("Không có quyền thao tác kho");
  }
}
