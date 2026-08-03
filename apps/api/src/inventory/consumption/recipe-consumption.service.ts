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

    // Load this branch's overrides + the chain-wide defaults for these tickets.
    const rows = await tx.ticketTypeRecipe.findMany({
      where: { ticketTypeId: { in: ticketTypeIds }, OR: [{ branchId: null }, { branchId: input.branchId }] },
    });
    if (rows.length === 0) return; // no BOM defined → nothing to deduct

    // Effective recipe per ticket type: the branch override REPLACES the
    // chain-wide recipe wholesale when the branch has any row for that ticket.
    const branchByTicket = new Map<string, typeof rows>();
    const chainByTicket = new Map<string, typeof rows>();
    for (const r of rows) {
      const bucket = r.branchId ? branchByTicket : chainByTicket;
      const list = bucket.get(r.ticketTypeId) ?? [];
      list.push(r);
      bucket.set(r.ticketTypeId, list);
    }

    // Aggregate consumption per ingredient across all ticket lines.
    const totalByIngredient = new Map<string, number>();
    for (const ticketTypeId of ticketTypeIds) {
      const effective = branchByTicket.get(ticketTypeId) ?? chainByTicket.get(ticketTypeId) ?? [];
      const tickets = qtyByTicket.get(ticketTypeId) ?? 0;
      if (tickets === 0) continue;
      for (const r of effective) {
        const add = Number(r.qtyBase) * tickets;
        totalByIngredient.set(r.ingredientId, (totalByIngredient.get(r.ingredientId) ?? 0) + add);
      }
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
