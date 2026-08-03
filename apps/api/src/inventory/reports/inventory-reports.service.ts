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

export interface ValuationQuery {
  branchId?: string;
}

export interface ConsumptionQuery {
  branchId?: string;
  from?: string;
  to?: string;
}

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
}
