import { BadRequestException, Injectable } from "@nestjs/common";
import { roundVnd } from "@ilikebuffet/shared";
import { StockMovementType } from "@prisma/client";
import { TxClient } from "../prisma/prisma.service";

/**
 * Maintains InventoryBalance from StockMovements, transactionally.
 *
 * Every mutation locks the (branch, ingredient) balance row with
 * INSERT … ON CONFLICT DO NOTHING + SELECT … FOR UPDATE — the same serialize
 * pattern as bill numbering — so two concurrent receipts/issues on the same
 * ingredient can't lose an update. Quantities are base-unit Decimal(12,3);
 * money is integer VND. On-hand quantity is never allowed below zero.
 *
 * Callers must invoke these INSIDE their own business transaction (`tx`) so the
 * movement row and the balance change commit or roll back together.
 */

/** Round a base-unit quantity to 3 decimals (matches Decimal(12,3) storage). */
function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

interface MovementRef {
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
}

export interface ApplyDeltaInput extends MovementRef {
  branchId: string;
  ingredientId: string;
  /** RECEIPT (delta > 0) or ISSUE (delta < 0), in base units. */
  type: "RECEIPT" | "ISSUE";
  qtyBase: number;
  /** Per-base-unit cost, integer VND. Required for RECEIPT (drives moving avg). */
  unitCostVnd?: number;
  createdBy: string;
}

export interface SetCountedInput extends MovementRef {
  branchId: string;
  ingredientId: string;
  /** New counted on-hand quantity, base units (>= 0). */
  countedQtyBase: number;
  createdBy: string;
}

export interface BalanceView {
  branchId: string;
  ingredientId: string;
  qtyBase: number;
  avgCostVnd: number;
}

@Injectable()
export class InventoryBalanceService {
  /**
   * Apply a RECEIPT (+) or ISSUE (−) delta and return the new balance.
   * RECEIPT recomputes the weighted moving-average cost; ISSUE leaves goods at
   * the current average and blocks if it would drive on-hand below zero.
   */
  async applyDelta(tx: TxClient, input: ApplyDeltaInput): Promise<BalanceView> {
    const { branchId, ingredientId, type } = input;
    const delta = roundQty(input.qtyBase);
    if (type === "RECEIPT" && delta <= 0) {
      throw new BadRequestException("Số lượng nhập phải lớn hơn 0");
    }
    if (type === "ISSUE" && delta >= 0) {
      throw new BadRequestException("Số lượng xuất phải nhỏ hơn 0");
    }

    const { qty: oldQty, avg: oldAvg } = await this.lockBalance(tx, branchId, ingredientId);
    const newQty = roundQty(oldQty + delta);
    if (newQty < 0) {
      throw new BadRequestException("Không đủ tồn kho để xuất");
    }

    let newAvg = oldAvg;
    let movementCost: number;
    if (type === "RECEIPT") {
      const recvCost = input.unitCostVnd ?? 0;
      // Weighted average; from an empty balance the incoming cost stands alone.
      newAvg = oldQty <= 0 ? recvCost : roundVnd((oldQty * oldAvg + delta * recvCost) / newQty);
      movementCost = recvCost;
    } else {
      // Goods leave valued at the current average.
      movementCost = oldAvg;
    }

    await this.writeMovement(tx, {
      branchId,
      ingredientId,
      type,
      qtyBase: delta,
      unitCostVnd: movementCost,
      refType: input.refType,
      refId: input.refId,
      note: input.note,
      createdBy: input.createdBy,
    });
    await this.updateBalance(tx, branchId, ingredientId, newQty, newAvg);
    return { branchId, ingredientId, qtyBase: newQty, avgCostVnd: newAvg };
  }

  /**
   * Set on-hand to a counted quantity (stock-take), recording the signed ADJUST
   * delta valued at the current average. The count itself cannot be negative.
   */
  async setCounted(tx: TxClient, input: SetCountedInput): Promise<BalanceView> {
    const { branchId, ingredientId } = input;
    const counted = roundQty(input.countedQtyBase);
    if (counted < 0) {
      throw new BadRequestException("Số kiểm kê không thể âm");
    }

    const { qty: oldQty, avg: oldAvg } = await this.lockBalance(tx, branchId, ingredientId);
    const delta = roundQty(counted - oldQty);

    await this.writeMovement(tx, {
      branchId,
      ingredientId,
      type: "ADJUST",
      qtyBase: delta,
      unitCostVnd: oldAvg,
      refType: input.refType,
      refId: input.refId,
      note: input.note,
      createdBy: input.createdBy,
    });
    await this.updateBalance(tx, branchId, ingredientId, counted, oldAvg);
    return { branchId, ingredientId, qtyBase: counted, avgCostVnd: oldAvg };
  }

  /** Create the balance row if absent, then lock it and return current qty/avg. */
  private async lockBalance(
    tx: TxClient,
    branchId: string,
    ingredientId: string,
  ): Promise<{ qty: number; avg: number }> {
    await tx.$executeRaw`
      INSERT INTO "inventory_balance" ("branchId", "ingredientId", "qtyBase", "avgCostVnd", "updatedAt")
      VALUES (${branchId}, ${ingredientId}, 0, 0, CURRENT_TIMESTAMP)
      ON CONFLICT ("branchId", "ingredientId") DO NOTHING
    `;
    const rows = await tx.$queryRaw<Array<{ qtyBase: string; avgCostVnd: number }>>`
      SELECT "qtyBase", "avgCostVnd" FROM "inventory_balance"
      WHERE "branchId" = ${branchId} AND "ingredientId" = ${ingredientId}
      FOR UPDATE
    `;
    return { qty: Number(rows[0]?.qtyBase ?? 0), avg: rows[0]?.avgCostVnd ?? 0 };
  }

  private writeMovement(
    tx: TxClient,
    m: {
      branchId: string;
      ingredientId: string;
      type: "RECEIPT" | "ISSUE" | "ADJUST";
      qtyBase: number;
      unitCostVnd: number | null;
      refType?: string | null;
      refId?: string | null;
      note?: string | null;
      createdBy: string;
    },
  ): Promise<unknown> {
    return tx.stockMovement.create({
      data: {
        branchId: m.branchId,
        ingredientId: m.ingredientId,
        type: m.type as StockMovementType,
        qtyBase: m.qtyBase,
        unitCostVnd: m.unitCostVnd,
        refType: m.refType ?? null,
        refId: m.refId ?? null,
        note: m.note ?? null,
        createdBy: m.createdBy,
      },
    });
  }

  private updateBalance(
    tx: TxClient,
    branchId: string,
    ingredientId: string,
    qtyBase: number,
    avgCostVnd: number,
  ): Promise<unknown> {
    return tx.inventoryBalance.update({
      where: { branchId_ingredientId: { branchId, ingredientId } },
      data: { qtyBase, avgCostVnd },
    });
  }
}
