/**
 * FinanceService — income/expense (thu-chi) entries against the chart of accounts.
 *
 * The account's flow is snapshotted onto each entry. When the amount exceeds the
 * account's approval threshold, a manager PIN is required (reusing the shared
 * approval-PIN flow), captured as approvedBy. Branch-scoped; every entry audited.
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma } from "@prisma/client";
import * as ExcelJS from "exceljs";
import { sumVnd } from "@ilikebuffet/shared";
import { PrismaService, TxClient } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { DiscountsService } from "../discounts/discounts.service";
import { assertBranchAccess, type BranchAccess } from "../../platform/rbac/branch-access";
import type { CreateFinancialDto, FinancialListQuery, PaySupplierDto, PayableListQuery, PayableAgingQuery } from "./finance.dto";

const DAY_MS = 86_400_000;

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

  /** List supplier payables (công nợ NCC) with outstanding + overdue flags. */
  async listPayables(query: PayableListQuery, access: BranchAccess) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.SupplierPayableWhereInput = {
      ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supplierPayable.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.supplierPayable.count({ where }),
    ]);
    const suppliers = await this.prisma.supplier.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.supplierId))] } }, select: { id: true, name: true } });
    const nameById = new Map(suppliers.map((s) => [s.id, s.name]));
    const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
    return {
      data: rows.map((r) => ({
        id: r.id,
        supplierId: r.supplierId,
        supplierName: nameById.get(r.supplierId) ?? r.supplierId,
        branchId: r.branchId,
        poId: r.poId,
        amountVnd: r.amountVnd,
        paidVnd: r.paidVnd,
        outstandingVnd: r.amountVnd - r.paidVnd,
        status: r.status,
        dueDate: r.dueDate,
        overdue: r.status === "OPEN" && !!r.dueDate && r.dueDate.getTime() < todayMs,
      })),
      total,
    };
  }

  /** OPEN payables (outstanding > 0) for aging/due-soon, branch-scoped, with a
   *  supplier-name map. Today is the VN date at midnight (ms). */
  private async openPayables(query: PayableAgingQuery, access: BranchAccess) {
    const where: Prisma.SupplierPayableWhereInput = {
      status: "OPEN",
      ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    };
    const rows = (await this.prisma.supplierPayable.findMany({ where })).filter((r) => r.amountVnd - r.paidVnd > 0);
    const suppliers = await this.prisma.supplier.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.supplierId))] } }, select: { id: true, name: true } });
    const nameById = new Map(suppliers.map((s) => [s.id, s.name]));
    const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
    return { rows, nameById, todayMs };
  }

  /**
   * Supplier-debt aging: outstanding of each OPEN payable bucketed by how many
   * days its dueDate is past today — not yet due, 1–30, 31–60, and 60+ days
   * overdue — grouped by supplier, with per-supplier and grand totals.
   */
  async payableAging(query: PayableAgingQuery, access: BranchAccess) {
    const { rows, nameById, todayMs } = await this.openPayables(query, access);

    type Bucket = { supplierId: string; supplierName: string; notDueVnd: number; d1_30Vnd: number; d31_60Vnd: number; d60plusVnd: number; totalOutstandingVnd: number };
    const bySupplier = new Map<string, Bucket>();
    for (const r of rows) {
      const outstanding = r.amountVnd - r.paidVnd;
      const b =
        bySupplier.get(r.supplierId) ??
        { supplierId: r.supplierId, supplierName: nameById.get(r.supplierId) ?? r.supplierId, notDueVnd: 0, d1_30Vnd: 0, d31_60Vnd: 0, d60plusVnd: 0, totalOutstandingVnd: 0 };
      const days = r.dueDate ? Math.floor((todayMs - r.dueDate.getTime()) / DAY_MS) : -1;
      if (days <= 0) b.notDueVnd = sumVnd([b.notDueVnd, outstanding]);
      else if (days <= 30) b.d1_30Vnd = sumVnd([b.d1_30Vnd, outstanding]);
      else if (days <= 60) b.d31_60Vnd = sumVnd([b.d31_60Vnd, outstanding]);
      else b.d60plusVnd = sumVnd([b.d60plusVnd, outstanding]);
      b.totalOutstandingVnd = sumVnd([b.totalOutstandingVnd, outstanding]);
      bySupplier.set(r.supplierId, b);
    }

    const suppliers = [...bySupplier.values()].sort((a, b) => b.totalOutstandingVnd - a.totalOutstandingVnd);
    const sum = (pick: (b: Bucket) => number) => sumVnd(suppliers.map(pick));
    return {
      totals: {
        notDueVnd: sum((b) => b.notDueVnd),
        d1_30Vnd: sum((b) => b.d1_30Vnd),
        d31_60Vnd: sum((b) => b.d31_60Vnd),
        d60plusVnd: sum((b) => b.d60plusVnd),
        totalOutstandingVnd: sum((b) => b.totalOutstandingVnd),
        supplierCount: suppliers.length,
      },
      suppliers,
    };
  }

  /** OPEN payables due within 7 days or already overdue, soonest first.
   *  daysOverdue > 0 = past due; ≤ 0 = days remaining (negated). */
  async dueSoon(query: PayableAgingQuery, access: BranchAccess) {
    const { rows, nameById, todayMs } = await this.openPayables(query, access);
    const items = rows
      .filter((r) => r.dueDate != null && Math.floor((r.dueDate.getTime() - todayMs) / DAY_MS) <= 7)
      .map((r) => ({
        id: r.id,
        supplierId: r.supplierId,
        supplierName: nameById.get(r.supplierId) ?? r.supplierId,
        branchId: r.branchId,
        outstandingVnd: r.amountVnd - r.paidVnd,
        dueDate: r.dueDate,
        daysOverdue: Math.floor((todayMs - r.dueDate!.getTime()) / DAY_MS),
      }))
      .sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()));
    return { items, total: items.length };
  }

  /** Aging report as an .xlsx workbook (supplier rows + a totals line). */
  async exportPayableAging(query: PayableAgingQuery, access: BranchAccess): Promise<Buffer> {
    const report = await this.payableAging(query, access);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Tuổi nợ NCC");
    sheet.columns = [
      { header: "Nhà cung cấp", key: "supplier", width: 28 },
      { header: "Chưa đến hạn", key: "notDue", width: 16 },
      { header: "1-30 ngày", key: "d1_30", width: 14 },
      { header: "31-60 ngày", key: "d31_60", width: 14 },
      { header: "60+ ngày", key: "d60", width: 14 },
      { header: "Tổng nợ", key: "total", width: 16 },
    ];
    for (const s of report.suppliers) {
      sheet.addRow({ supplier: s.supplierName, notDue: s.notDueVnd, d1_30: s.d1_30Vnd, d31_60: s.d31_60Vnd, d60: s.d60plusVnd, total: s.totalOutstandingVnd });
    }
    sheet.addRow({});
    sheet.addRow({ supplier: "TỔNG", notDue: report.totals.notDueVnd, d1_30: report.totals.d1_30Vnd, d31_60: report.totals.d31_60Vnd, d60: report.totals.d60plusVnd, total: report.totals.totalOutstandingVnd });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Pay (fully or partially) a supplier payable: books an EXPENSE entry and
   *  increments paidVnd, marking PAID when settled. */
  async paySupplier(payableId: string, dto: PaySupplierDto, actorId: string, role: string, access: BranchAccess) {
    const payable = await this.prisma.supplierPayable.findUnique({ where: { id: payableId } });
    if (!payable) throw new NotFoundException("Không tìm thấy công nợ");
    assertBranchAccess(access, payable.branchId);
    if (payable.status === "PAID") throw new BadRequestException("Công nợ đã thanh toán đủ");
    const remaining = payable.amountVnd - payable.paidVnd;
    if (dto.amountVnd > remaining) throw new BadRequestException("Số tiền vượt quá công nợ còn lại");

    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!account || account.flow !== "EXPENSE") throw new BadRequestException("Tài khoản chi không hợp lệ");
    const needsApproval = account.approvalThresholdVnd > 0 && dto.amountVnd > account.approvalThresholdVnd;
    if (needsApproval && (!dto.managerId || !dto.pin)) throw new ForbiddenException("Vượt ngưỡng — cần quản lý duyệt PIN");
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const branch = await this.prisma.branch.findUnique({ where: { id: payable.branchId }, select: { code: true } });

    return this.prisma.withTx(async (tx) => {
      let approvedBy: string | null = null;
      if (needsApproval) {
        const r = await this.discounts.verifyApprovalPin({ managerId: dto.managerId!, pin: dto.pin!, branchId: payable.branchId, reason: "supplier-pay" }, actorId, role, tx);
        if (!r.approved) throw new ForbiddenException("PIN quản lý không hợp lệ hoặc đã bị khoá");
        approvedBy = r.approvedBy ?? null;
      }
      const code = await this.nextCode(tx, branch?.code ?? "TC", payable.branchId);
      const entry = await tx.financialTransaction.create({
        data: { code, branchId: payable.branchId, accountId: dto.accountId, flow: "EXPENSE", amountVnd: dto.amountVnd, method: dto.method as PaymentMethod, occurredAt, note: dto.note ?? null, supplierId: payable.supplierId, createdBy: actorId, approvedBy },
      });
      const paidVnd = payable.paidVnd + dto.amountVnd;
      const updated = await tx.supplierPayable.update({
        where: { id: payableId },
        data: { paidVnd, status: paidVnd >= payable.amountVnd ? "PAID" : "OPEN" },
      });
      await this.audit.record(tx, { actorId, actorRole: role, action: "finance.supplier-pay", objectType: "supplier_payable", objectId: payableId, branchId: payable.branchId, approvedBy: approvedBy ?? undefined, after: { entryId: entry.id, amountVnd: dto.amountVnd, paidVnd, status: updated.status } });
      return { id: updated.id, paidVnd: updated.paidVnd, outstandingVnd: updated.amountVnd - updated.paidVnd, status: updated.status };
    });
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
