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
}
