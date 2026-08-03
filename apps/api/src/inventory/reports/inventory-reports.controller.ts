/**
 * InventoryReportsController — read-only stock valuation under
 * /inventory/reports. Branch-scoped; gated to INVENTORY_VIEW_ROLES (warehouse,
 * branch manager, chain admins, and chain accountant).
 */
import { Controller, ForbiddenException, Get, Query, Request } from "@nestjs/common";
import { InventoryReportsService, type ValuationQuery, type ConsumptionQuery } from "./inventory-reports.service";
import { INVENTORY_VIEW_ROLES } from "../inventory-roles";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";

@Controller("inventory/reports")
export class InventoryReportsController {
  constructor(private readonly service: InventoryReportsService) {}

  @Get("valuation")
  valuation(@Query() query: ValuationQuery, @Request() req: ScopedRequest) {
    this.assertView(req);
    return this.service.valuation(query, { chainWide: req.user.chainWide, branchIds: req.user.branchIds });
  }

  @Get("consumption")
  consumption(@Query() query: ConsumptionQuery, @Request() req: ScopedRequest) {
    this.assertView(req);
    return this.service.consumption(query, { chainWide: req.user.chainWide, branchIds: req.user.branchIds });
  }

  private assertView(req: ScopedRequest) {
    if (!INVENTORY_VIEW_ROLES.has(req.user.role as Role)) {
      throw new ForbiddenException("Không có quyền xem báo cáo kho");
    }
  }
}
