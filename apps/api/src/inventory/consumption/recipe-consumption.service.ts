/**
 * RecipeConsumptionService — deduct (and reverse) ingredient stock for a sale.
 *
 * Selling a ticket consumes Σ(recipe.qtyBase × ticket qty) of each ingredient
 * from the bill's branch. Consumption is recorded as ISSUE movements tagged
 * refType "BILL"; it never blocks a sale (allows negative on-hand) and leaves
 * the moving-average cost unchanged. Cancelling a bill reverses it from the
 * recorded movements (not the recipe — safe if the recipe changed meanwhile),
 * tagged "BILL_REVERSAL" and made idempotent.
 *
 * All methods run inside the caller's bill transaction so stock and the bill
 * commit or roll back together. Ingredients are processed in id order to keep a
 * stable lock ordering across concurrent bills.
 */
import { Injectable } from "@nestjs/common";
import { PrismaService, TxClient } from "../../prisma/prisma.service";
import { InventoryBalanceService } from "../inventory-balance.service";

const REF_SALE = "BILL";
const REF_REVERSAL = "BILL_REVERSAL";

export interface BillConsumptionInput {
  billId: string;
  branchId: string;
  /** The bill's ticket lines (free tickets included — guests still consume). */
  lines: { ticketTypeId: string; qty: number }[];
}

@Injectable()
export class RecipeConsumptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: InventoryBalanceService,
  ) {}

  /** Deduct estimated ingredient stock for a newly-created bill. */
  async consumeForBill(tx: TxClient, input: BillConsumptionInput, actorId: string): Promise<void> {
    const qtyByTicket = new Map<string, number>();
    for (const l of input.lines) {
      qtyByTicket.set(l.ticketTypeId, (qtyByTicket.get(l.ticketTypeId) ?? 0) + l.qty);
    }
    const ticketTypeIds = [...qtyByTicket.keys()];
    if (ticketTypeIds.length === 0) return;

    const recipes = await tx.ticketTypeRecipe.findMany({
      where: { ticketTypeId: { in: ticketTypeIds } },
    });
    if (recipes.length === 0) return; // no BOM defined → nothing to deduct

    // Aggregate consumption per ingredient across all ticket lines.
    const totalByIngredient = new Map<string, number>();
    for (const r of recipes) {
      const tickets = qtyByTicket.get(r.ticketTypeId) ?? 0;
      if (tickets === 0) continue;
      const add = Number(r.qtyBase) * tickets;
      totalByIngredient.set(r.ingredientId, (totalByIngredient.get(r.ingredientId) ?? 0) + add);
    }

    for (const ingredientId of [...totalByIngredient.keys()].sort()) {
      const total = totalByIngredient.get(ingredientId)!;
      if (!(total > 0)) continue;
      await this.balance.applyConsumption(tx, {
        branchId: input.branchId,
        ingredientId,
        deltaQtyBase: -total,
        refType: REF_SALE,
        refId: input.billId,
        createdBy: actorId,
      });
    }
  }

  /** Return the stock consumed by a bill when it is cancelled. Idempotent. */
  async reverseForBill(tx: TxClient, billId: string, actorId: string): Promise<void> {
    const already = await tx.stockMovement.count({
      where: { refType: REF_REVERSAL, refId: billId },
    });
    if (already > 0) return; // already reversed

    const consumed = await tx.stockMovement.findMany({
      where: { refType: REF_SALE, refId: billId, type: "ISSUE" },
    });

    for (const m of [...consumed].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId))) {
      // Consumed qty is stored negative; add it back.
      await this.balance.applyConsumption(tx, {
        branchId: m.branchId,
        ingredientId: m.ingredientId,
        deltaQtyBase: -Number(m.qtyBase),
        refType: REF_REVERSAL,
        refId: billId,
        createdBy: actorId,
      });
    }
  }
}
