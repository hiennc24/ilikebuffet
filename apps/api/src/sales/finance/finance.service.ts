/**
 * FinanceService — income/expense (thu-chi) entries against the chart of accounts.
 *
 * The account's flow is snapshotted onto each entry. When the amount exceeds the
 * account's approval threshold, a manager PIN is required (reusing the shared
 * approval-PIN flow), captured as approvedBy. Branch-scoped; every entry audited.
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma } from "@prisma/client";
import { sumVnd } from "@ilikebuffet/shared";
import { PrismaService, TxClient } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { DiscountsService } from "../discounts/discounts.service";
import { assertBranchAccess, type BranchAccess } from "../../platform/rbac/branch-access";
import type { CreateFinancialDto, FinancialListQuery } from "./finance.dto";

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly discounts: DiscountsService,
  ) {}

  async create(dto: CreateFinancialDto, actorId: string, role: string, access: BranchAccess) {
    assertBranchAccess(access, dto.branchId);
    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!account) throw new NotFoundException("Không tìm thấy tài khoản");
    const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
    if (!branch) throw new NotFoundException("Không tìm thấy chi nhánh");
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) throw new NotFoundException("Không tìm thấy nhà cung cấp");
    }

    const needsApproval = account.approvalThresholdVnd > 0 && dto.amountVnd > account.approvalThresholdVnd;
    if (needsApproval && (!dto.managerId || !dto.pin)) {
      throw new ForbiddenException("Phiếu vượt ngưỡng — cần quản lý duyệt bằng PIN");
    }
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.withTx(async (tx) => {
          let approvedBy: string | null = null;
          if (needsApproval) {
            const result = await this.discounts.verifyApprovalPin(
              { managerId: dto.managerId!, pin: dto.pin!, branchId: dto.branchId, reason: `finance:${account.name}` },
              actorId,
              role,
              tx,
            );
            if (!result.approved) throw new ForbiddenException("PIN quản lý không hợp lệ hoặc đã bị khoá");
            approvedBy = result.approvedBy ?? null;
          }

          const code = await this.nextCode(tx, branch.code, dto.branchId);
          const entry = await tx.financialTransaction.create({
            data: {
              code,
              branchId: dto.branchId,
              accountId: dto.accountId,
              flow: account.flow,
              amountVnd: dto.amountVnd,
              method: dto.method as PaymentMethod,
              occurredAt,
              note: dto.note ?? null,
              supplierId: dto.supplierId ?? null,
              createdBy: actorId,
              approvedBy,
            },
          });
          await this.audit.record(tx, {
            actorId,
            actorRole: role,
            action: "finance.create",
            objectType: "financial_transaction",
            objectId: entry.id,
            branchId: dto.branchId,
            approvedBy: approvedBy ?? undefined,
            after: { code, flow: account.flow, amountVnd: dto.amountVnd, accountId: dto.accountId, method: dto.method },
          });
          return this.toView(entry, account.name);
        });
      } catch (e) {
        if (this.isCodeCollision(e) && attempt < 4) continue;
        throw e;
      }
    }
    throw new BadRequestException("Không thể tạo mã phiếu");
  }

  async list(query: FinancialListQuery, access: BranchAccess) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const occurredAt: { gte?: Date; lte?: Date } = {};
    if (query.from) occurredAt.gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) occurredAt.lte = new Date(`${query.to}T23:59:59Z`);
    const where: Prisma.FinancialTransactionWhereInput = {
      ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.flow ? { flow: query.flow } : {}),
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(occurredAt.gte || occurredAt.lte ? { occurredAt } : {}),
    };

    const [rows, total, incomeAgg, expenseAgg] = await Promise.all([
      this.prisma.financialTransaction.findMany({ where, orderBy: { occurredAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.financialTransaction.count({ where }),
      this.prisma.financialTransaction.aggregate({ where: { ...where, flow: "INCOME" }, _sum: { amountVnd: true } }),
      this.prisma.financialTransaction.aggregate({ where: { ...where, flow: "EXPENSE" }, _sum: { amountVnd: true } }),
    ]);

    const nameById = await this.accountNames(rows.map((r) => r.accountId));
    const incomeVnd = incomeAgg._sum.amountVnd ?? 0;
    const expenseVnd = expenseAgg._sum.amountVnd ?? 0;
    return {
      data: rows.map((r) => this.toView(r, nameById.get(r.accountId) ?? r.accountId)),
      total,
      totals: { incomeVnd, expenseVnd, netVnd: incomeVnd - expenseVnd },
    };
  }

  /** Expense/income totals grouped by account over a period (thu-chi summary). */
  async summary(query: FinancialListQuery, access: BranchAccess) {
    const occurredAt: { gte?: Date; lte?: Date } = {};
    if (query.from) occurredAt.gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) occurredAt.lte = new Date(`${query.to}T23:59:59Z`);
    const where: Prisma.FinancialTransactionWhereInput = {
      ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(occurredAt.gte || occurredAt.lte ? { occurredAt } : {}),
    };

    const grouped = await this.prisma.financialTransaction.groupBy({
      by: ["accountId", "flow"],
      where,
      _sum: { amountVnd: true },
    });
    const nameById = await this.accountNames(grouped.map((g) => g.accountId));
    const rows = grouped
      .map((g) => ({ accountId: g.accountId, accountName: nameById.get(g.accountId) ?? g.accountId, flow: g.flow, amountVnd: g._sum.amountVnd ?? 0 }))
      .sort((a, b) => b.amountVnd - a.amountVnd);
    const incomeVnd = sumVnd(rows.filter((r) => r.flow === "INCOME").map((r) => r.amountVnd));
    const expenseVnd = sumVnd(rows.filter((r) => r.flow === "EXPENSE").map((r) => r.amountVnd));
    return { rows, totals: { incomeVnd, expenseVnd, netVnd: incomeVnd - expenseVnd } };
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private async nextCode(tx: TxClient, branchCode: string, branchId: string): Promise<string> {
    const count = await tx.financialTransaction.count({ where: { branchId } });
    return `TC-${branchCode}-${String(count + 1).padStart(4, "0")}`;
  }

  private isCodeCollision(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String(e.meta?.target ?? "").includes("code");
  }

  private async accountNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    const accounts = await this.prisma.account.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(accounts.map((a) => [a.id, a.name]));
  }

  private toView(t: Prisma.FinancialTransactionGetPayload<object>, accountName: string) {
    return {
      id: t.id,
      code: t.code,
      branchId: t.branchId,
      accountId: t.accountId,
      accountName,
      flow: t.flow,
      amountVnd: t.amountVnd,
      method: t.method,
      occurredAt: t.occurredAt,
      note: t.note,
      supplierId: t.supplierId,
      approvedBy: t.approvedBy,
    };
  }
}
