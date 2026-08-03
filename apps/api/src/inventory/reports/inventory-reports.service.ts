/**
 * InventoryReportsService — stock valuation aggregates (read-only).
 *
 * Value = Σ roundVnd(qty × avgCost) over on-hand balances, broken down by branch
 * and ingredient group, with a low-stock count (qty < defaultMinStock). Every
 * query is branch-scoped by the caller's BranchAccess.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { roundVnd, sumVnd } from "@ilikebuffet/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { BranchAccess } from "../../platform/rbac/branch-access";
import { fifoCogs, type FifoMovement } from "./fifo-cogs";

export interface ValuationQuery {
  branchId?: string;
}

export interface ConsumptionQuery {
  branchId?: string;
  from?: string;
  to?: string;
}

export type FifoCogsQuery = ConsumptionQuery;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class InventoryReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async valuation(query: ValuationQuery, access: BranchAccess) {
    const where: Prisma.InventoryBalanceWhereInput = {
      ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };

    const rows = await this.prisma.inventoryBalance.findMany({
      where,
      include: {
        ingredient: { select: { defaultMinStock: true, group: { select: { name: true } } } },
      },
    });

    const byBranch = new Map<string, { valueVnd: number; itemCount: number; lowStockCount: number }>();
    const byGroup = new Map<string, number>();
    const values: number[] = [];
    let lowStockCount = 0;

    for (const r of rows) {
      const qty = Number(r.qtyBase);
      // roundVnd wraps the product; qty is fractional so multiplyVnd does not apply.
      // eslint-disable-next-line money/no-unsafe-money-arithmetic -- roundVnd enforces the integer result
      const value = roundVnd(qty * r.avgCostVnd);
      const low = qty < Number(r.ingredient.defaultMinStock);
      if (low) lowStockCount++;
      values.push(value);

      const b = byBranch.get(r.branchId) ?? { valueVnd: 0, itemCount: 0, lowStockCount: 0 };
      b.valueVnd = sumVnd([b.valueVnd, value]);
      b.itemCount += 1;
      if (low) b.lowStockCount += 1;
      byBranch.set(r.branchId, b);

      const g = r.ingredient.group.name;
      byGroup.set(g, sumVnd([byGroup.get(g) ?? 0, value]));
    }

    return {
      totalValueVnd: sumVnd(values),
      itemCount: rows.length,
      lowStockCount,
      byBranch: [...byBranch.entries()].map(([branchId, v]) => ({ branchId, ...v })),
      byGroup: [...byGroup.entries()]
        .map(([group, valueVnd]) => ({ group, valueVnd }))
        .sort((a, b) => b.valueVnd - a.valueVnd),
    };
  }

  /**
   * Estimated cost of goods sold over a period: net sale-driven movements
   * (ISSUE refType "BILL" minus "BILL_REVERSAL"), valued at each movement's
   * cost. Signed sums net out bills cancelled within the window.
   */
  async consumption(query: ConsumptionQuery, access: BranchAccess) {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (query.from) createdAt.gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) createdAt.lte = new Date(`${query.to}T23:59:59Z`);

    const where: Prisma.StockMovementWhereInput = {
      refType: { in: ["BILL", "BILL_REVERSAL"] },
      ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(createdAt.gte || createdAt.lte ? { createdAt } : {}),
    };

    const rows = await this.prisma.stockMovement.findMany({
      where,
      include: { ingredient: { select: { name: true, unit: { select: { code: true } } } } },
    });

    const byIngredient = new Map<
      string,
      { ingredientId: string; name: string; unitCode: string; consumedQtyBase: number; cogsVnd: number }
    >();
    let totalCogsVnd = 0;

    for (const m of rows) {
      const qty = Number(m.qtyBase); // negative = consumed, positive = returned
      const cost = m.unitCostVnd ?? 0;
      const value = roundVnd(qty * cost); // integer đồng; qty fractional, cost integer VND
      const cur =
        byIngredient.get(m.ingredientId) ??
        { ingredientId: m.ingredientId, name: m.ingredient.name, unitCode: m.ingredient.unit.code, consumedQtyBase: 0, cogsVnd: 0 };
      cur.consumedQtyBase = Math.round((cur.consumedQtyBase - qty) * 1000) / 1000; // net consumed (positive)
      cur.cogsVnd = sumVnd([cur.cogsVnd, -value]);
      byIngredient.set(m.ingredientId, cur);
      totalCogsVnd = sumVnd([totalCogsVnd, -value]);
    }

    return {
      totalCogsVnd,
      byIngredient: [...byIngredient.values()].sort((a, b) => b.cogsVnd - a.cogsVnd),
    };
  }

  /**
   * Actual per-lot (FIFO) cost of goods SOLD over a period — an alternative to
   * the moving-average COGS above. The whole ledger is replayed per (branch,
   * ingredient) so lot state is correct when the window is reached; only sales
   * whose bill business-day falls in [from, to] are summed. Moving-average and
   * on-hand balances are unaffected.
   */
  async fifoCogs(query: FifoCogsQuery, access: BranchAccess) {
    const where: Prisma.StockMovementWhereInput = {
      ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };

    const moves = await this.prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: { branchId: true, ingredientId: true, type: true, qtyBase: true, unitCostVnd: true, refType: true, refId: true },
    });

    // Resolve the business day of every sale/reversal bill (for the COGS bucket).
    const billIds = [
      ...new Set(
        moves.filter((m) => m.refId && (m.refType === "BILL" || m.refType === "BILL_REVERSAL")).map((m) => m.refId as string),
      ),
    ];
    const dayByBill = new Map<string, string>();
    if (billIds.length > 0) {
      const bills = await this.prisma.bill.findMany({ where: { id: { in: billIds } }, select: { id: true, businessDate: true } });
      for (const b of bills) dayByBill.set(b.id, dayKey(b.businessDate));
    }

    // Group by (branch, ingredient); movements keep their global createdAt order.
    const groups = new Map<string, FifoMovement[]>();
    for (const m of moves) {
      const list = groups.get(`${m.branchId}:${m.ingredientId}`) ?? [];
      list.push({
        type: m.type,
        qtyBase: Number(m.qtyBase),
        unitCostVnd: m.unitCostVnd,
        refType: m.refType,
        dayKey: m.refType === "BILL" && m.refId ? dayByBill.get(m.refId) ?? null : null,
      });
      groups.set(`${m.branchId}:${m.ingredientId}`, list);
    }

    const byDay = new Map<string, number>();
    for (const list of groups.values()) {
      const r = fifoCogs(list);
      for (const [day, cogs] of Object.entries(r.byDay)) {
        byDay.set(day, sumVnd([byDay.get(day) ?? 0, cogs]));
      }
    }

    const inRange = (d: string) => (!query.from || d >= query.from) && (!query.to || d <= query.to);
    const rows = [...byDay.entries()]
      .filter(([d]) => inRange(d))
      .map(([day, cogsVnd]) => ({ day, cogsVnd }))
      .sort((a, b) => (a.day < b.day ? 1 : -1));

    return { totalCogsVnd: sumVnd(rows.map((r) => r.cogsVnd)), byDay: rows };
  }
}
