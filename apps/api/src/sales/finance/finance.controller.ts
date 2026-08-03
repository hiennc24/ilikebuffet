/**
 * FinanceController — income/expense (thu-chi) endpoints under /sales/finance.
 *
 * Gated by the capability matrix (permissions.ts `can()`), not a hardcoded role
 * set — E3 is the first module to enforce it, so finance access is managed in one
 * place. Create needs `cash:create-voucher`; read needs `cash:read`. Branch
 * scoping is applied in the service (the body carries branchId).
 */
import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Request } from "@nestjs/common";
import { FinanceService } from "./finance.service";
import { can, type Capability } from "../../platform/rbac/permissions";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { CreateFinancialDto, FinancialListQuery, PaySupplierDto, PayableListQuery } from "./finance.dto";

@Controller("sales/finance")
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  private require(req: ScopedRequest, capability: Capability) {
    if (!can(req.user.role as Role, capability)) {
      throw new ForbiddenException("Không có quyền thao tác thu-chi");
    }
    return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
  }

  @Get()
  list(@Query() query: FinancialListQuery, @Request() req: ScopedRequest) {
    const access = this.require(req, "cash:read");
    return this.service.list(query, access);
  }

  @Get("summary")
  summary(@Query() query: FinancialListQuery, @Request() req: ScopedRequest) {
    const access = this.require(req, "cash:read");
    return this.service.summary(query, access);
  }

  @Post()
  create(@Body() dto: CreateFinancialDto, @Request() req: ScopedRequest) {
    const access = this.require(req, "cash:create-voucher");
    return this.service.create(dto, req.user.sub, req.user.role, access);
  }

  @Get("payables")
  payables(@Query() query: PayableListQuery, @Request() req: ScopedRequest) {
    const access = this.require(req, "cash:read");
    return this.service.listPayables(query, access);
  }

  @Post("payables/:id/pay")
  paySupplier(@Param("id") id: string, @Body() dto: PaySupplierDto, @Request() req: ScopedRequest) {
    const access = this.require(req, "cash:create-voucher");
    return this.service.paySupplier(id, dto, req.user.sub, req.user.role, access);
  }
}
