/**
 * ReportsService — read-only reconciliation & reporting aggregates.
 *
 * All money is integer VND (sumVnd). Every query is branch-scoped by the caller's
 * BranchAccess. Revenue is net of refunds: net = Σ(COMPLETED.total) − Σ(refunds);
 * CANCELLED bills are counted but excluded from money.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { sumVnd } from "@ilikebuffet/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { BranchAccess } from "../../platform/rbac/branch-access";
import type { RevenueQuery, ShiftCashQuery } from "./reports.dto";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
