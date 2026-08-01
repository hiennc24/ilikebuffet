/**
 * ShiftsController — BH-01 shift lifecycle endpoints.
 *
 * Branch-scoped (no @Unscoped). BranchScopeGuard reads branchId from the
 * request body/query and enforces membership before this controller runs.
 *
 * Role gates (inline — mirrors discounts.controller.ts pattern):
 *   open        — THU_NGAN, QUAN_LY_CN, QUAN_TRI_HQ
 *   close       — THU_NGAN
 *   force-close — THU_NGAN (manager approves via PIN in service layer)
 *   list / open-shift — any authenticated branch member
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
import { ShiftsService } from "./shifts.service";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type {
  OpenShiftDto,
  CloseShiftDto,
  ForceCloseShiftDto,
  ShiftListQuery,
} from "./shifts.dto";

@Controller("sales/shifts")
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  /** GET /sales/shifts — list shifts, optionally filtered by branchId and/or status. */
  @Get()
  list(@Query() query: ShiftListQuery) {
    return this.service.list(query);
  }

  /** GET /sales/shifts/open?deviceId= — current open shift for a device. */
  @Get("open")
  getOpen(@Query("deviceId") deviceId: string) {
    return this.service.getOpenShift(deviceId);
  }

  /** POST /sales/shifts — open a new shift on a device. */
  @Post()
  open(@Body() dto: OpenShiftDto, @Request() req: ScopedRequest) {
    const { role } = req.user;
    if (
      role !== Role.THU_NGAN &&
      role !== Role.QUAN_LY_CN &&
      role !== Role.QUAN_TRI_HQ
    ) {
      throw new ForbiddenException("Không có quyền mở ca");
    }
    return this.service.open(dto, req.user.sub, role);
  }

  /** POST /sales/shifts/:id/close — close an open shift with cash count. */
  @Post(":id/close")
  close(
    @Param("id") id: string,
    @Body() dto: CloseShiftDto,
    @Request() req: ScopedRequest,
  ) {
    if (req.user.role !== Role.THU_NGAN) {
      throw new ForbiddenException("Chỉ Thu ngân mới có thể đóng ca");
    }
    return this.service.close(id, dto, req.user.sub, req.user.role);
  }

  /** POST /sales/shifts/:id/force-close — force-close with manager PIN approval. */
  @Post(":id/force-close")
  forceClose(
    @Param("id") id: string,
    @Body() dto: ForceCloseShiftDto,
    @Request() req: ScopedRequest,
  ) {
    // THU_NGAN initiates; manager authorises via PIN in service.
    if (
      req.user.role !== Role.THU_NGAN &&
      req.user.role !== Role.QUAN_LY_CN &&
      req.user.role !== Role.QUAN_TRI_HQ
    ) {
      throw new ForbiddenException("Không có quyền đóng ca bắt buộc");
    }
    return this.service.forceClose(id, dto, req.user.sub, req.user.role);
  }
}
