/**
 * BankTransactionsController — reconciliation admin under /sales/bank-transactions.
 *
 * Bank reconciliation is a chain-level accounting function, so it is gated to
 * QUAN_TRI_HQ / CHU_CHUOI / KE_TOAN_CHUOI (no branch scoping — unmatched transfers
 * have no branch yet). Manual match re-checks branch access on the target bill.
 */
import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Request } from "@nestjs/common";
import { BankReconcileService } from "./bank-reconcile.service";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { BankTxListQuery, MatchBankTxDto, IgnoreBankTxDto } from "./bank-transactions.dto";

const RECONCILE_ROLES = new Set<Role>([Role.QUAN_TRI_HQ, Role.CHU_CHUOI, Role.KE_TOAN_CHUOI]);

@Controller("sales/bank-transactions")
export class BankTransactionsController {
  constructor(private readonly service: BankReconcileService) {}

  private assert(req: ScopedRequest) {
    if (!RECONCILE_ROLES.has(req.user.role as Role)) {
      throw new ForbiddenException("Không có quyền đối soát ngân hàng");
    }
    return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
  }

  @Get()
  list(@Query() query: BankTxListQuery, @Request() req: ScopedRequest) {
    this.assert(req);
    return this.service.list(query);
  }

  @Post(":id/match")
  match(@Param("id") id: string, @Body() dto: MatchBankTxDto, @Request() req: ScopedRequest) {
    const access = this.assert(req);
    return this.service.matchByNumber(id, dto.billNumber, req.user.sub, access);
  }

  @Post(":id/ignore")
  ignore(@Param("id") id: string, @Body() dto: IgnoreBankTxDto, @Request() req: ScopedRequest) {
    this.assert(req);
    return this.service.ignore(id, dto.note ?? "", req.user.sub);
  }
}
