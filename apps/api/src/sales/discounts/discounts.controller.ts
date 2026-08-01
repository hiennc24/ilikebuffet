/**
 * DiscountsController — VG-03 HTTP endpoints.
 *
 * Role gates:
 *   - Create / update / deactivate programs: QUAN_TRI_HQ only.
 *   - List programs: authenticated (scope-filtered in service).
 *   - Redeem voucher: THU_NGAN (POS).
 *   - Verify approval PIN: THU_NGAN at POS (requests PIN from QUAN_LY_CN).
 *   - Manage reasons: QUAN_TRI_HQ only.
 */
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from "@nestjs/common";
import { DiscountsService } from "./discounts.service";
import { Unscoped } from "../../platform/rbac/decorators";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type {
  CreateDiscountProgramDto,
  UpdateDiscountProgramDto,
  DiscountProgramListQuery,
  CreateDiscountReasonDto,
  RedeemVoucherDto,
  VerifyApprovalPinDto,
} from "./discounts.dto";

@Unscoped()
@Controller("sales/discounts/programs")
export class DiscountProgramController {
  constructor(private readonly service: DiscountsService) {}

  @Get()
  list(@Query() query: DiscountProgramListQuery) {
    return this.service.listPrograms(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOneProgram(id);
  }

  @Post()
  create(@Body() dto: CreateDiscountProgramDto, @Request() req: ScopedRequest) {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ can create discount programs");
    }
    return this.service.createProgram(dto, req.user.sub, req.user.role);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDiscountProgramDto,
    @Request() req: ScopedRequest,
  ) {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ can update discount programs");
    }
    return this.service.updateProgram(id, dto, req.user.sub, req.user.role);
  }

  @Delete(":id")
  deactivate(@Param("id") id: string, @Request() req: ScopedRequest) {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ can deactivate discount programs");
    }
    return this.service.deactivateProgram(id, req.user.sub, req.user.role);
  }
}

@Controller("sales/discounts/vouchers")
export class VoucherController {
  constructor(private readonly service: DiscountsService) {}

  @Post("redeem")
  redeem(@Body() dto: RedeemVoucherDto, @Request() req: ScopedRequest) {
    return this.service.redeemVoucher(dto, req.user.sub, req.user.role);
  }
}

@Controller("sales/discounts/approval-pin")
export class ApprovalPinController {
  constructor(private readonly service: DiscountsService) {}

  @Post("verify")
  verify(@Body() dto: VerifyApprovalPinDto, @Request() req: ScopedRequest) {
    return this.service.verifyApprovalPin(dto, req.user.sub, req.user.role);
  }
}

@Unscoped()
@Controller("sales/discounts/reasons")
export class DiscountReasonController {
  constructor(private readonly service: DiscountsService) {}

  @Get()
  list() {
    return this.service.listReasons();
  }

  @Post()
  create(@Body() dto: CreateDiscountReasonDto, @Request() req: ScopedRequest) {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ can manage discount reasons");
    }
    return this.service.createReason(dto, req.user.sub, req.user.role);
  }
}
