/**
 * InventoryReportsController — read-only stock valuation under
 * /inventory/reports. Branch-scoped; gated to the inventory:read capability
 * (warehouse, branch manager, chain admins, and chain accountant).
 */
import { Controller, ForbiddenException, Get, Query, Request } from "@nestjs/common";
import { InventoryReportsService, type ValuationQuery, type ConsumptionQuery, type FifoCogsQuery } from "./inventory-reports.service";
import { PermissionService } from "../../platform/rbac/permission.service";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";

@Controller("inventory/reports")
export class InventoryReportsController {
  constructor(
    private readonly service: InventoryReportsService,
    private readonly perms: PermissionService,
  ) {}

  @Get("valuation")
  async valuation(@Query() query: ValuationQuery, @Request() req: ScopedRequest) {
    await this.assertView(req);
    return this.service.valuation(query, { chainWide: req.user.chainWide, branchIds: req.user.branchIds });
  }

  @Get("consumption")
  async consumption(@Query() query: ConsumptionQuery, @Request() req: ScopedRequest) {
    await this.assertView(req);
    return this.service.consumption(query, { chainWide: req.user.chainWide, branchIds: req.user.branchIds });
  }

  @Get("fifo-cogs")
  async fifoCogs(@Query() query: FifoCogsQuery, @Request() req: ScopedRequest) {
    await this.assertView(req);
    return this.service.fifoCogs(query, { chainWide: req.user.chainWide, branchIds: req.user.branchIds });
  }

  private async assertView(req: ScopedRequest) {
    if (!(await this.perms.can(req.user.role, "inventory:read"))) {
      throw new ForbiddenException("Không có quyền xem báo cáo kho");
    }
  }
}
