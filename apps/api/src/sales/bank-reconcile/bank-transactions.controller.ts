/**
 * BankTransactionsController — reconciliation admin under /sales/bank-transactions.
 *
 * Bank reconciliation is a chain-level accounting function, so it is gated to
 * QUAN_TRI_HQ / CHU_CHUOI / KE_TOAN_CHUOI (no branch scoping — unmatched transfers
 * have no branch yet). Manual match re-checks branch access on the target bill.
 */
import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Request } from "@nestjs/common";
import { BankReconcileService } from "./bank-reconcile.service";
import { PermissionService } from "../../platform/rbac/permission.service";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import { BankTxListQuery, MatchBankTxDto, IgnoreBankTxDto } from "./bank-transactions.dto";

@Controller("sales/bank-transactions")
export class BankTransactionsController {
  constructor(
    private readonly service: BankReconcileService,
    private readonly perms: PermissionService,
  ) {}

  private async assert(req: ScopedRequest) {
    if (!(await this.perms.can(req.user.role, "bank:reconcile"))) {
      throw new ForbiddenException("Không có quyền đối soát ngân hàng");
    }
    return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
  }

  @Get()
  async list(@Query() query: BankTxListQuery, @Request() req: ScopedRequest) {
    await this.assert(req);
    return this.service.list(query);
  }

  @Post(":id/match")
  async match(@Param("id") id: string, @Body() dto: MatchBankTxDto, @Request() req: ScopedRequest) {
    const access = await this.assert(req);
    return this.service.matchByNumber(id, dto.billNumber, req.user.sub, access);
  }

  @Post(":id/ignore")
  async ignore(@Param("id") id: string, @Body() dto: IgnoreBankTxDto, @Request() req: ScopedRequest) {
    await this.assert(req);
    return this.service.ignore(id, dto.note ?? "", req.user.sub);
  }
}
