/**
 * ReportsService — read-only reconciliation & reporting aggregates.
 *
 * All money is integer VND (sumVnd). Every query is branch-scoped by the caller's
 * BranchAccess. Revenue is net of refunds: net = Σ(COMPLETED.total) − Σ(refunds);
 * CANCELLED bills are counted but excluded from money.
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { sumVnd, toVnDateStr } from "@ilikebuffet/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { assertBranchAccess, type BranchAccess } from "../../platform/rbac/branch-access";
import type { RevenueQuery, ShiftCashQuery, QuarantineQuery } from "./reports.dto";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

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
