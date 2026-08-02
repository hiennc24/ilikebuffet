/**
 * StockService — read on-hand balances and history; issue and adjust stock.
 *
 * Balances join the ingredient for name/unit/min-stock and derive value =
 * roundVnd(qty × avgCost) and a low-stock flag (qty < defaultMinStock). Manual
 * ISSUE (wastage) and stock-take ADJUST go through InventoryBalanceService so
 * they lock the row, block negative on-hand, and append a movement — each inside
 * a transaction with its audit row. Every query is branch-scoped by the caller.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { roundVnd } from "@ilikebuffet/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { assertBranchAccess, type BranchAccess } from "../../platform/rbac/branch-access";
import { InventoryBalanceService } from "../inventory-balance.service";
import type { StockListQuery, MovementListQuery, IssueStockDto, AdjustStockDto } from "./stock.dto";

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly balance: InventoryBalanceService,
  ) {}

  /** On-hand balances with value + low-stock flag. Low-stock needs a column-to-
   *  column compare, so filtering/paging is done in memory (per-branch scale). */
  async listStock(query: StockListQuery, access: BranchAccess) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.InventoryBalanceWhereInput = {
      ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.q
        ? {
            ingredient: {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                { code: { contains: query.q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };

    const rows = await this.prisma.inventoryBalance.findMany({
      where,
      include: {
        ingredient: { select: { name: true, code: true, defaultMinStock: true, unit: { select: { code: true } } } },
      },
      orderBy: { ingredient: { name: "asc" } },
    });

    let mapped = rows.map((r) => {
      const qty = Number(r.qtyBase);
      const minStock = Number(r.ingredient.defaultMinStock);
      return {
        branchId: r.branchId,
        ingredientId: r.ingredientId,
        ingredientName: r.ingredient.name,
        ingredientCode: r.ingredient.code,
        unitCode: r.ingredient.unit.code,
        qtyBase: qty,
        avgCostVnd: r.avgCostVnd,
        // roundVnd wraps the product; qty is fractional so multiplyVnd does not apply.
        // eslint-disable-next-line money/no-unsafe-money-arithmetic -- roundVnd enforces the integer result
        valueVnd: roundVnd(qty * r.avgCostVnd),
        minStock,
        lowStock: qty < minStock,
      };
    });
    if (query.lowOnly) mapped = mapped.filter((m) => m.lowStock);

    const total = mapped.length;
    const data = mapped.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    return { data, total };
  }

  async listMovements(query: MovementListQuery, access: BranchAccess) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 200);
    const where: Prisma.StockMovementWhereInput = {
      ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.ingredientId ? { ingredientId: query.ingredientId } : {}),
      ...this.dateWhere(query.from, query.to),
    };

    const [rows, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: { ingredient: { select: { name: true, unit: { select: { code: true } } } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      data: rows.map((m) => ({
        id: m.id,
        branchId: m.branchId,
        ingredientId: m.ingredientId,
        ingredientName: m.ingredient.name,
        unitCode: m.ingredient.unit.code,
        type: m.type,
        qtyBase: Number(m.qtyBase),
        unitCostVnd: m.unitCostVnd,
        refType: m.refType,
        refId: m.refId,
        note: m.note,
        createdAt: m.createdAt,
      })),
      total,
    };
  }

  async issue(dto: IssueStockDto, actorId: string, role: string, access: BranchAccess) {
    assertBranchAccess(access, dto.branchId);
    return this.prisma.withTx(async (tx) => {
      const b = await this.balance.applyDelta(tx, {
        branchId: dto.branchId,
        ingredientId: dto.ingredientId,
        type: "ISSUE",
        qtyBase: -Math.abs(dto.qty),
        note: dto.note,
        createdBy: actorId,
      });
      await this.audit.record(tx, {
        actorId,
        actorRole: role,
        action: "stock.issue",
        objectType: "ingredient",
        objectId: dto.ingredientId,
        branchId: dto.branchId,
        reason: dto.note,
        after: { qtyIssued: dto.qty, onHand: b.qtyBase },
      });
      return b;
    });
  }

  async adjust(dto: AdjustStockDto, actorId: string, role: string, access: BranchAccess) {
    assertBranchAccess(access, dto.branchId);
    return this.prisma.withTx(async (tx) => {
      const b = await this.balance.setCounted(tx, {
        branchId: dto.branchId,
        ingredientId: dto.ingredientId,
        countedQtyBase: dto.newQty,
        note: dto.note,
        createdBy: actorId,
      });
      await this.audit.record(tx, {
        actorId,
        actorRole: role,
        action: "stock.adjust",
        objectType: "ingredient",
        objectId: dto.ingredientId,
        branchId: dto.branchId,
        reason: dto.note,
        after: { countedTo: dto.newQty },
      });
      return b;
    });
  }

  private dateWhere(from?: string, to?: string): Prisma.StockMovementWhereInput {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (from) createdAt.gte = new Date(`${from}T00:00:00Z`);
    if (to) createdAt.lte = new Date(`${to}T23:59:59Z`);
    return createdAt.gte || createdAt.lte ? { createdAt } : {};
  }
}
