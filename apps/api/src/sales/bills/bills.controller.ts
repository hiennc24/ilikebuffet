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
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { CreateBillDto, CancelBillDto } from "./bills.dto";

@Controller("sales/bills")
export class BillsController {
  constructor(private readonly service: BillsService) {}

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
  listByShift(@Query("shiftId") shiftId: string, @Request() req: ScopedRequest) {
    if (!shiftId) {
      return [];
    }
    return this.service.listByShift(shiftId, {
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
