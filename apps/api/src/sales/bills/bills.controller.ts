/**
 * BillsController — HTTP endpoints for bill creation, lookup, and cancellation.
 *
 * Role gates mirror discounts.controller.ts pattern:
 *   POST   sales/bills         → THU_NGAN only
 *   GET    sales/bills/:id     → authenticated (branch-scoped by guard)
 *   GET    sales/bills?shiftId → authenticated
 *   POST   sales/bills/:id/cancel → THU_NGAN only (manager PIN in body)
 *
 * Branch-scoped (no @Unscoped): BranchScopeGuard enforces membership via
 * branchId in the request body/params.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Request,
} from "@nestjs/common";
import { BillsService } from "./bills.service";
import { Role } from "../../platform/rbac/role.enum";
import { PermissionService } from "../../platform/rbac/permission.service";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { CreateBillDto, CancelBillDto, BillListQuery, RefundBillDto } from "./bills.dto";

@Controller("sales/bills")
export class BillsController {
  constructor(
    private readonly service: BillsService,
    private readonly perms: PermissionService,
  ) {}

  @Post()
  create(@Body() dto: CreateBillDto, @Request() req: ScopedRequest) {
    if (req.user.role !== Role.THU_NGAN) {
      throw new ForbiddenException("Only THU_NGAN can create bills");
    }
    return this.service.createBill(dto, req.user.sub, req.user.role);
  }

  @Get(":id")
  getById(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.getById(id, { chainWide: req.user.chainWide, branchIds: req.user.branchIds });
  }

  @Get()
  list(@Query() query: BillListQuery & { shiftId?: string }, @Request() req: ScopedRequest) {
    const access = { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
    // Back-compat: POS shift monitor lists a shift's bills as a bare array.
    if (query.shiftId) {
      return this.service.listByShift(query.shiftId, access);
    }
    // Admin Orders: paginated, filterable list ({ data, total } envelope).
    return this.service.listBills(query, access);
  }

  @Post(":id/refund")
  async refund(@Param("id") id: string, @Body() dto: RefundBillDto, @Request() req: ScopedRequest) {
    // Refund is a manager action — HQ or branch manager (branch enforced by the
    // manager PIN branch-binding + assertBranchAccess in the service).
    if (!(await this.perms.can(req.user.role, "bill:manage"))) {
      throw new ForbiddenException("Không có quyền hoàn tiền");
    }
    return this.service.refundBill(id, dto, req.user.sub, req.user.role, {
      chainWide: req.user.chainWide,
      branchIds: req.user.branchIds,
    });
  }

  @Post(":id/cancel")
  cancel(
    @Param("id") id: string,
    @Body() dto: CancelBillDto,
    @Request() req: ScopedRequest,
  ) {
    if (req.user.role !== Role.THU_NGAN) {
      throw new ForbiddenException("Only THU_NGAN can cancel bills");
    }
    return this.service.cancelBill(id, dto, req.user.sub, req.user.role, {
      chainWide: req.user.chainWide,
      branchIds: req.user.branchIds,
    });
  }
}
