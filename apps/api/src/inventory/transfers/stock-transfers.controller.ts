/**
 * StockTransfersController — inter-branch transfers under /inventory/transfers.
 *
 * The body carries fromBranchId/toBranchId (not a single `branchId`), so the
 * global guard passes keyless and the service re-checks access to BOTH branches.
 * Create is gated to chain admins + branch managers (who must hold access to both
 * ends); list is branch-scoped in the service.
 */
import { Body, Controller, ForbiddenException, Get, Post, Query, Request } from "@nestjs/common";
import { StockTransfersService } from "./stock-transfers.service";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { CreateTransferDto, TransferListQuery } from "./stock-transfers.dto";

const TRANSFER_ROLES = new Set<Role>([Role.QUAN_TRI_HQ, Role.CHU_CHUOI, Role.QUAN_LY_CN]);

@Controller("inventory/transfers")
export class StockTransfersController {
  constructor(private readonly service: StockTransfersService) {}

  private access(req: ScopedRequest) {
    return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
  }

  @Get()
  list(@Query() query: TransferListQuery, @Request() req: ScopedRequest) {
    return this.service.list(query, this.access(req));
  }

  @Post()
  create(@Body() dto: CreateTransferDto, @Request() req: ScopedRequest) {
    if (!TRANSFER_ROLES.has(req.user.role as Role)) {
      throw new ForbiddenException("Không có quyền điều chuyển kho");
    }
    return this.service.create(dto, req.user.sub, req.user.role, this.access(req));
  }
}
