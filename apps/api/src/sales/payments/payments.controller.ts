/**
 * PaymentsController — BH-03 HTTP endpoint for recording payments.
 *
 * POST sales/bills/:billId/payments → THU_NGAN only
 *
 * Branch-scoped (no @Unscoped): BranchScopeGuard enforces membership.
 * The billId in the URL path identifies the resource; branch membership
 * is checked in the service via the bill's branchId.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
  Request,
} from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { AddPaymentsDto } from "./payments.dto";

@Controller("sales/bills/:billId/payments")
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post()
  addPayments(
    @Param("billId") billId: string,
    @Body() dto: AddPaymentsDto,
    @Request() req: ScopedRequest,
  ) {
    if (req.user.role !== Role.THU_NGAN) {
      throw new ForbiddenException("Only THU_NGAN can record payments");
    }
    return this.service.addPayments(billId, dto, req.user.sub, req.user.role, {
      chainWide: req.user.chainWide,
      branchIds: req.user.branchIds,
    });
  }
}
