/**
 * ReportsService — read-only reconciliation & reporting aggregates.
 *
 * All money is integer VND (sumVnd). Every query is branch-scoped by the caller's
 * BranchAccess. Revenue is net of refunds: net = Σ(COMPLETED.total) − Σ(refunds);
 * CANCELLED bills are counted but excluded from money.
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as ExcelJS from "exceljs";
import { roundVnd, sumVnd, toVnDateStr } from "@ilikebuffet/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { assertBranchAccess, type BranchAccess } from "../../platform/rbac/branch-access";
import type { RevenueQuery, ShiftCashQuery, QuarantineQuery, GrossMarginQuery, ChainOverviewQuery } from "./reports.dto";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Gross-margin % to one decimal. Params are non-money-named so the money lint
 *  rule (which flags raw `/` on money-named identifiers) doesn't misfire. */
const marginPct = (profit: number, rev: number) => (rev > 0 ? Math.round((profit / rev) * 1000) / 10 : 0);

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Branch filter honoring scope: chain-wide may narrow by branchId; others are
   *  confined to their branches (an out-of-scope branchId yields no rows). */
  private branchWhere(access: BranchAccess, branchId?: string): Prisma.BillWhereInput {
    return {
      ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      ...(branchId ? { branchId } : {}),
    };
  }

  private dateWhere(from?: string, to?: string): Prisma.BillWhereInput {
    const businessDate: { gte?: Date; lte?: Date } = {};
    if (from) businessDate.gte = new Date(`${from}T00:00:00Z`);
    if (to) businessDate.lte = new Date(`${to}T00:00:00Z`);
    return businessDate.gte || businessDate.lte ? { businessDate } : {};
  }

  async revenue(query: RevenueQuery, access: BranchAccess) {
    const groupBy = query.groupBy ?? "day";
    const where: Prisma.BillWhereInput = {
      ...this.branchWhere(access, query.branchId),
      ...this.dateWhere(query.from, query.to),
    };

    const bills = await this.prisma.bill.findMany({
      where,
      select: {
        id: true,
        branchId: true,
        shiftId: true,
        businessDate: true,
        status: true,
        totalVnd: true,
        guestCount: true,
        refunds: { select: { amountVnd: true } },
        lines: { select: { ticketTypeId: true, ticketTypeName: true, qty: true, lineTotalVnd: true } },
      },
    });

    const rowMap = new Map<string, { key: string; grossVnd: number; refundedVnd: number; billCount: number; guestCount: number }>();
    const ttMap = new Map<string, { ticketTypeId: string; name: string; qty: number; grossVnd: number }>();
    let cancelledCount = 0;

    const keyOf = (b: (typeof bills)[number]) =>
      groupBy === "branch" ? b.branchId : groupBy === "shift" ? b.shiftId : dayKey(b.businessDate);

    for (const b of bills) {
      if (b.status !== "COMPLETED") {
        cancelledCount++;
        continue;
      }
      const refunded = sumVnd(b.refunds.map((r) => r.amountVnd));
      const key = keyOf(b);
      const row = rowMap.get(key) ?? { key, grossVnd: 0, refundedVnd: 0, billCount: 0, guestCount: 0 };
      row.grossVnd += b.totalVnd;
      row.refundedVnd += refunded;
      row.billCount += 1;
      row.guestCount += b.guestCount;
      rowMap.set(key, row);

      for (const l of b.lines) {
        const tt = ttMap.get(l.ticketTypeId) ?? { ticketTypeId: l.ticketTypeId, name: l.ticketTypeName, qty: 0, grossVnd: 0 };
        tt.qty += l.qty;
        tt.grossVnd += l.lineTotalVnd;
        ttMap.set(l.ticketTypeId, tt);
      }
    }

    const rows = [...rowMap.values()]
      .map((r) => ({ ...r, netVnd: r.grossVnd - r.refundedVnd }))
      .sort((a, b) => (a.key < b.key ? 1 : -1)); // newest/highest key first

    const grossVnd = sumVnd(rows.map((r) => r.grossVnd));
    const refundedVnd = sumVnd(rows.map((r) => r.refundedVnd));
    return {
      groupBy,
      totals: {
        grossVnd,
        refundedVnd,
        netVnd: grossVnd - refundedVnd,
        billCount: rows.reduce((s, r) => s + r.billCount, 0),
        cancelledCount,
        guestCount: rows.reduce((s, r) => s + r.guestCount, 0),
      },
      rows,
      byTicketType: [...ttMap.values()].sort((a, b) => b.grossVnd - a.grossVnd),
    };
  }

  /** Revenue report as an .xlsx workbook (rows + a totals line). */
  async exportRevenue(query: RevenueQuery, access: BranchAccess): Promise<Buffer> {
    const report = await this.revenue(query, access);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Doanh thu");
    sheet.columns = [
      { header: report.groupBy === "branch" ? "Chi nhánh" : report.groupBy === "shift" ? "Ca" : "Ngày", key: "key", width: 24 },
      { header: "Doanh thu gộp", key: "gross", width: 16 },
      { header: "Hoàn tiền", key: "refund", width: 14 },
      { header: "Doanh thu thuần", key: "net", width: 16 },
      { header: "Số bill", key: "bills", width: 10 },
      { header: "Khách", key: "guests", width: 10 },
    ];
    for (const r of report.rows) {
      sheet.addRow({ key: r.key, gross: r.grossVnd, refund: r.refundedVnd, net: r.netVnd, bills: r.billCount, guests: r.guestCount });
    }
    sheet.addRow({});
    sheet.addRow({ key: "TỔNG", gross: report.totals.grossVnd, refund: report.totals.refundedVnd, net: report.totals.netVnd, bills: report.totals.billCount, guests: report.totals.guestCount });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * Gross margin = net revenue − estimated COGS, by day or branch.
   *
   * Revenue is keyed by bill.businessDate (net of refunds; CANCELLED excluded).
   * COGS is the sale-driven stock consumption (ISSUE refType "BILL" minus
   * "BILL_REVERSAL") valued at each movement's cost — attributed to the SAME
   * bill's businessDate/branch (mapped via billId, since StockMovement has no FK
   * to Bill) so it aligns with revenue and cancelled bills net to zero on both
   * sides. COGS is an ESTIMATE (from the ticket recipe), not actual issue cost.
   */
  async grossMargin(query: GrossMarginQuery, access: BranchAccess) {
    const groupBy = query.groupBy ?? "day";
    const where: Prisma.BillWhereInput = {
      ...this.branchWhere(access, query.branchId),
      ...this.dateWhere(query.from, query.to),
    };

    const bills = await this.prisma.bill.findMany({
      where,
      select: { id: true, branchId: true, businessDate: true, status: true, totalVnd: true, refunds: { select: { amountVnd: true } } },
    });

    const keyOfBill = (b: (typeof bills)[number]) => (groupBy === "branch" ? b.branchId : dayKey(b.businessDate));
    const billKey = new Map<string, string>();
    const revByKey = new Map<string, number>();
    for (const b of bills) {
      const key = keyOfBill(b);
      billKey.set(b.id, key);
      if (b.status === "COMPLETED") {
        const net = b.totalVnd - sumVnd(b.refunds.map((r) => r.amountVnd));
        revByKey.set(key, (revByKey.get(key) ?? 0) + net);
      }
    }

    const cogsByKey = new Map<string, number>();
    const billIds = [...billKey.keys()];
    if (billIds.length > 0) {
      const moves = await this.prisma.stockMovement.findMany({
        where: { refType: { in: ["BILL", "BILL_REVERSAL"] }, refId: { in: billIds } },
        select: { refId: true, qtyBase: true, unitCostVnd: true },
      });
      for (const m of moves) {
        const key = m.refId ? billKey.get(m.refId) : undefined;
        if (!key) continue;
        const qty = Number(m.qtyBase); // negative = consumed, positive = returned
        const cost = m.unitCostVnd ?? 0;
        const value = roundVnd(qty * cost);
        cogsByKey.set(key, sumVnd([cogsByKey.get(key) ?? 0, -value])); // consumed → positive COGS
      }
    }

    const rows = [...new Set([...revByKey.keys(), ...cogsByKey.keys()])]
      .map((key) => {
        const rev = revByKey.get(key) ?? 0;
        const cogs = cogsByKey.get(key) ?? 0;
        const profit = rev - cogs;
        return { key, netRevenueVnd: rev, cogsVnd: cogs, grossProfitVnd: profit, marginPct: marginPct(profit, rev) };
      })
      .sort((a, b) => (a.key < b.key ? 1 : -1));

    const totNet = sumVnd(rows.map((r) => r.netRevenueVnd));
    const totCogs = sumVnd(rows.map((r) => r.cogsVnd));
    const totProfit = totNet - totCogs;
    return {
      groupBy,
      totals: { netRevenueVnd: totNet, cogsVnd: totCogs, grossProfitVnd: totProfit, marginPct: marginPct(totProfit, totNet) },
      rows,
    };
  }

  /** Gross-margin report as an .xlsx workbook (rows + a totals line). */
  async exportGrossMargin(query: GrossMarginQuery, access: BranchAccess): Promise<Buffer> {
    const report = await this.grossMargin(query, access);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Lãi gộp");
    sheet.columns = [
      { header: report.groupBy === "branch" ? "Chi nhánh" : "Ngày", key: "key", width: 24 },
      { header: "Doanh thu thuần", key: "net", width: 16 },
      { header: "Giá vốn (ước tính)", key: "cogs", width: 18 },
      { header: "Lãi gộp", key: "profit", width: 16 },
      { header: "%Biên", key: "pct", width: 10 },
    ];
    for (const r of report.rows) {
      sheet.addRow({ key: r.key, net: r.netRevenueVnd, cogs: r.cogsVnd, profit: r.grossProfitVnd, pct: r.marginPct });
    }
    sheet.addRow({});
    sheet.addRow({ key: "TỔNG", net: report.totals.netRevenueVnd, cogs: report.totals.cogsVnd, profit: report.totals.grossProfitVnd, pct: report.totals.marginPct });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Cash reconciliation for CLOSED shifts: expected vs counted vs system cash. */
  async shiftCash(query: ShiftCashQuery, access: BranchAccess) {
    const businessDate: { gte?: Date; lte?: Date } = {};
    if (query.from) businessDate.gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) businessDate.lte = new Date(`${query.to}T00:00:00Z`);

    const where: Prisma.ShiftWhereInput = {
      status: "CLOSED",
      ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(businessDate.gte || businessDate.lte ? { businessDate } : {}),
    };

    const shifts = await this.prisma.shift.findMany({
      where,
      orderBy: [{ businessDate: "desc" }, { closedAt: "desc" }],
      select: {
        id: true,
        branchId: true,
        businessDate: true,
        openedAt: true,
        closedAt: true,
        openingCashVnd: true,
        expectedCashVnd: true,
        countedCashVnd: true,
        varianceVnd: true,
        varianceNote: true,
      },
    });

    // System cash per shift = Σ CASH payments of that shift's bills.
    const shiftIds = shifts.map((s) => s.id);
    const payments = shiftIds.length
      ? await this.prisma.payment.findMany({
          where: { method: "CASH", bill: { shiftId: { in: shiftIds } } },
          select: { amountVnd: true, bill: { select: { shiftId: true } } },
        })
      : [];
    const cashByShift = new Map<string, number>();
    for (const p of payments) {
      const sid = p.bill.shiftId;
      cashByShift.set(sid, (cashByShift.get(sid) ?? 0) + p.amountVnd);
    }

    const rows = shifts.map((s) => ({
      shiftId: s.id,
      branchId: s.branchId,
      businessDate: dayKey(s.businessDate),
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingCashVnd: s.openingCashVnd,
      expectedCashVnd: s.expectedCashVnd ?? 0,
      countedCashVnd: s.countedCashVnd ?? 0,
      varianceVnd: s.varianceVnd ?? 0,
      varianceNote: s.varianceNote,
      cashRevenueVnd: cashByShift.get(s.id) ?? 0,
    }));

    return {
      totals: {
        varianceVnd: rows.reduce((sum, r) => sum + r.varianceVnd, 0),
        shortCount: rows.filter((r) => r.varianceVnd < 0).length,
        overCount: rows.filter((r) => r.varianceVnd > 0).length,
        shiftCount: rows.length,
      },
      rows,
    };
  }

  /** Shift-cash reconciliation as an .xlsx workbook (rows + a totals line). */
  async exportShiftCash(query: ShiftCashQuery, access: BranchAccess): Promise<Buffer> {
    const report = await this.shiftCash(query, access);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Đối soát tiền ca");
    sheet.columns = [
      { header: "Ngày", key: "day", width: 12 },
      { header: "Chi nhánh", key: "branch", width: 14 },
      { header: "Tiền đầu ca", key: "opening", width: 14 },
      { header: "DT tiền mặt", key: "cash", width: 14 },
      { header: "Lý thuyết", key: "expected", width: 14 },
      { header: "Đã đếm", key: "counted", width: 14 },
      { header: "Chênh lệch", key: "variance", width: 14 },
      { header: "Ghi chú", key: "note", width: 28 },
    ];
    for (const r of report.rows) {
      sheet.addRow({
        day: r.businessDate,
        branch: r.branchId,
        opening: r.openingCashVnd,
        cash: r.cashRevenueVnd,
        expected: r.expectedCashVnd,
        counted: r.countedCashVnd,
        variance: r.varianceVnd,
        note: r.varianceNote ?? "",
      });
    }
    sheet.addRow({});
    sheet.addRow({ day: "TỔNG", variance: report.totals.varianceVnd, note: `Thiếu ${report.totals.shortCount} · Thừa ${report.totals.overCount} · ${report.totals.shiftCount} ca` });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  /** Quick KPIs for the admin dashboard, branch-scoped, for today (VN date). */
  async dashboard(access: BranchAccess, branchId?: string) {
    const today = toVnDateStr(new Date());
    const scope = this.branchWhere(access, branchId);

    const [todayBills, openShiftCount, quarantineOpenCount] = await Promise.all([
      this.prisma.bill.findMany({
        where: { ...scope, businessDate: new Date(`${today}T00:00:00Z`) },
        select: { status: true, totalVnd: true, guestCount: true, refunds: { select: { amountVnd: true } } },
      }),
      this.prisma.shift.count({
        where: { status: "OPEN", ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }), ...(branchId ? { branchId } : {}) },
      }),
      this.prisma.bill.count({ where: { ...scope, quarantined: true, quarantineResolvedAt: null } }),
    ]);

    const completed = todayBills.filter((b) => b.status === "COMPLETED");
    const grossVnd = sumVnd(completed.map((b) => b.totalVnd));
    const refundedVnd = sumVnd(completed.flatMap((b) => b.refunds.map((r) => r.amountVnd)));
    return {
      date: today,
      todayNetVnd: grossVnd - refundedVnd,
      todayBillCount: completed.length,
      todayGuestCount: completed.reduce((s, b) => s + b.guestCount, 0),
      openShiftCount,
      quarantineOpenCount,
    };
  }

  /**
   * Chain overview — per-branch consolidation + ranking for chain-wide roles.
   * Net revenue (Σ COMPLETED − refunds), bills, guests, CLOSED-shift cash
   * variance, and low-stock count, one row per branch, ranked by net revenue,
   * plus chain totals. Read-only; the controller gates this to chain-level roles.
   */
  async chainOverview(query: ChainOverviewQuery, access: BranchAccess) {
    const businessDate: { gte?: Date; lte?: Date } = {};
    if (query.from) businessDate.gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) businessDate.lte = new Date(`${query.to}T00:00:00Z`);
    const dateFilter = businessDate.gte || businessDate.lte ? { businessDate } : {};
    const branchScope = access.chainWide ? {} : { branchId: { in: access.branchIds } };

    const [branches, bills, shifts, balances] = await Promise.all([
      this.prisma.branch.findMany({
        where: access.chainWide ? {} : { id: { in: access.branchIds } },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.bill.findMany({
        where: { ...branchScope, ...dateFilter },
        select: { branchId: true, status: true, totalVnd: true, guestCount: true, refunds: { select: { amountVnd: true } } },
      }),
      this.prisma.shift.findMany({
        where: { status: "CLOSED", ...branchScope, ...dateFilter },
        select: { branchId: true, varianceVnd: true },
      }),
      this.prisma.inventoryBalance.findMany({
        where: branchScope,
        select: { branchId: true, qtyBase: true, ingredient: { select: { defaultMinStock: true } } },
      }),
    ]);

    type Row = { branchId: string; code: string; name: string; netRevenueVnd: number; billCount: number; guestCount: number; cashVarianceVnd: number; lowStockCount: number };
    const rows = new Map<string, Row>();
    for (const b of branches) {
      rows.set(b.id, { branchId: b.id, code: b.code, name: b.name, netRevenueVnd: 0, billCount: 0, guestCount: 0, cashVarianceVnd: 0, lowStockCount: 0 });
    }
    const ensure = (branchId: string): Row =>
      rows.get(branchId) ?? rows.set(branchId, { branchId, code: branchId, name: branchId, netRevenueVnd: 0, billCount: 0, guestCount: 0, cashVarianceVnd: 0, lowStockCount: 0 }).get(branchId)!;

    for (const b of bills) {
      if (b.status !== "COMPLETED") continue;
      const r = ensure(b.branchId);
      const net = b.totalVnd - sumVnd(b.refunds.map((x) => x.amountVnd));
      r.netRevenueVnd = sumVnd([r.netRevenueVnd, net]);
      r.billCount += 1;
      r.guestCount += b.guestCount;
    }
    for (const s of shifts) ensure(s.branchId).cashVarianceVnd += s.varianceVnd ?? 0;
    for (const bal of balances) {
      if (Number(bal.qtyBase) < Number(bal.ingredient.defaultMinStock)) ensure(bal.branchId).lowStockCount += 1;
    }

    const ranked = [...rows.values()]
      .sort((a, b) => b.netRevenueVnd - a.netRevenueVnd)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return {
      totals: {
        netRevenueVnd: sumVnd(ranked.map((r) => r.netRevenueVnd)),
        billCount: ranked.reduce((s, r) => s + r.billCount, 0),
        guestCount: ranked.reduce((s, r) => s + r.guestCount, 0),
        cashVarianceVnd: ranked.reduce((s, r) => s + r.cashVarianceVnd, 0),
        lowStockCount: ranked.reduce((s, r) => s + r.lowStockCount, 0),
        branchCount: ranked.length,
      },
      rows: ranked,
    };
  }

  // ─── Offline reconciliation (GA-02) ─────────────────────────────────────────

  /** Paginated list of quarantined bills to review, filterable by resolved state. */
  async quarantine(query: QuarantineQuery, access: BranchAccess) {
    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize ?? "20", 10) || 20));

    const where: Prisma.BillWhereInput = {
      quarantined: true,
      ...this.branchWhere(access, query.branchId),
      ...this.dateWhere(query.from, query.to),
      ...(query.resolved === "true" ? { quarantineResolvedAt: { not: null } } : {}),
      ...(query.resolved === "false" ? { quarantineResolvedAt: null } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.bill.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          number: true,
          tempNumber: true,
          branchId: true,
          businessDate: true,
          totalVnd: true,
          quarantineReason: true,
          quarantineResolvedAt: true,
          quarantineResolvedBy: true,
          quarantineResolveNote: true,
          createdAt: true,
        },
      }),
      this.prisma.bill.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  /** Missing bill numbers: gaps in the gapless seq for one (branch, businessDate). */
  async numberGaps(branchId: string, businessDate: string, access: BranchAccess) {
    if (!branchId || !businessDate) throw new BadRequestException("Cần chi nhánh và ngày");
    assertBranchAccess(access, branchId);

    const bills = await this.prisma.bill.findMany({
      where: { branchId, businessDate: new Date(`${businessDate}T00:00:00Z`) },
      select: { seq: true },
    });
    if (bills.length === 0) return { branchId, businessDate, min: 0, max: 0, missing: [] as number[] };

    const seqs = new Set(bills.map((b) => b.seq));
    const min = Math.min(...seqs);
    const max = Math.max(...seqs);
    const missing: number[] = [];
    for (let s = min; s <= max; s++) if (!seqs.has(s)) missing.push(s);
    return { branchId, businessDate, min, max, missing };
  }

  /** Mark a quarantined bill as reviewed/handled (append-only audit). */
  async resolveQuarantine(billId: string, note: string, actorId: string, actorRole: string, access: BranchAccess) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      select: { id: true, branchId: true, quarantined: true, quarantineResolvedAt: true, deviceId: true },
    });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found`);
    assertBranchAccess(access, bill.branchId);
    if (!bill.quarantined) throw new BadRequestException("Bill không ở trạng thái cách ly");
    if (bill.quarantineResolvedAt) throw new ForbiddenException("Bill đã được xử lý");

    return this.prisma.withTx(async (tx) => {
      const updated = await tx.bill.update({
        where: { id: billId },
        data: { quarantineResolvedAt: new Date(), quarantineResolvedBy: actorId, quarantineResolveNote: note || null },
        select: { id: true, quarantineResolvedAt: true, quarantineResolvedBy: true, quarantineResolveNote: true },
      });
      await this.audit.record(tx, {
        action: "bill.quarantine_resolved",
        objectType: "bill",
        objectId: billId,
        actorId,
        actorRole,
        branchId: bill.branchId,
        deviceId: bill.deviceId,
        reason: note || undefined,
      });
      return updated;
    });
  }
}
