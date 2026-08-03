/**
 * FinanceController — income/expense (thu-chi) endpoints under /sales/finance.
 *
 * Gated by the capability matrix (permissions.ts `can()`), not a hardcoded role
 * set — E3 is the first module to enforce it, so finance access is managed in one
 * place. Create needs `cash:create-voucher`; read needs `cash:read`. Branch
 * scoping is applied in the service (the body carries branchId).
 */
import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Request, Res } from "@nestjs/common";
import type { Response } from "express";
import { FinanceService } from "./finance.service";
import { can, type Capability } from "../../platform/rbac/permissions";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import { CreateFinancialDto, FinancialListQuery, PaySupplierDto, PayableListQuery, PayableAgingQuery } from "./finance.dto";

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

  @Get("payables/aging")
  aging(@Query() query: PayableAgingQuery, @Request() req: ScopedRequest) {
    const access = this.require(req, "cash:read");
    return this.service.payableAging(query, access);
  }

  @Get("payables/aging/export")
  async exportAging(@Query() query: PayableAgingQuery, @Request() req: ScopedRequest, @Res() res: Response) {
    const access = this.require(req, "cash:read");
    const buffer = await this.service.exportPayableAging(query, access);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="tuoi-no-ncc.xlsx"`);
    res.send(buffer);
  }

  @Get("payables/due-soon")
  dueSoon(@Query() query: PayableAgingQuery, @Request() req: ScopedRequest) {
    const access = this.require(req, "cash:read");
    return this.service.dueSoon(query, access);
  }

  @Post("payables/:id/pay")
  paySupplier(@Param("id") id: string, @Body() dto: PaySupplierDto, @Request() req: ScopedRequest) {
    const access = this.require(req, "cash:create-voucher");
    return this.service.paySupplier(id, dto, req.user.sub, req.user.role, access);
  }
}
