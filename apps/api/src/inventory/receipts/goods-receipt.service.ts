/**
 * GoodsReceiptService — book a purchase order's goods into stock.
 *
 * Receiving converts each line's purchase-unit quantity to base units via the
 * ingredient's factor, records a RECEIPT movement, and folds the cost into the
 * moving-average balance (all through InventoryBalanceService, transactionally).
 * The order must be SENT; a successful receipt moves it to RECEIVED. Received
 * lines must correspond to ordered (ingredient, purchase-unit) pairs; qty and
 * price may differ. Money is integer VND; quantities are fractional base units.
 */
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { roundVnd } from "@ilikebuffet/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { assertBranchAccess, type BranchAccess } from "../../platform/rbac/branch-access";
import { InventoryBalanceService } from "../inventory-balance.service";
import type { ReceiveGoodsDto, ReceiveLineDto } from "./goods-receipt.dto";

/** Round a base-unit quantity to 3 decimals (matches Decimal(12,3) storage). */
function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

@Injectable()
export class GoodsReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly balance: InventoryBalanceService,
  ) {}

  async receive(
    poId: string,
    dto: ReceiveGoodsDto,
    actorId: string,
    role: string,
    access: BranchAccess,
  ) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { lines: true },
    });
    if (!po) throw new NotFoundException("Không tìm thấy đơn mua");
    assertBranchAccess(access, po.branchId);
    if (po.status !== "SENT") {
      throw new BadRequestException("Chỉ nhập kho cho đơn đã gửi");
    }

    // Ordered (ingredient, unit) → PO line, for correspondence + price defaults.
    const orderedByKey = new Map(po.lines.map((l) => [`${l.ingredientId}:${l.unitId}`, l]));

    const requested: ReceiveLineDto[] =
      dto.lines && dto.lines.length > 0
        ? dto.lines
        : po.lines.map((l) => ({ ingredientId: l.ingredientId, unitId: l.unitId, qty: Number(l.qty) }));

    // Resolve each line's unit → base factor and effective price up front.
    const ingredientIds = [...new Set(requested.map((l) => l.ingredientId))];
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds } },
      include: { purchaseUnits: { select: { unitId: true, factorToBase: true } } },
    });
    const ingById = new Map(ingredients.map((i) => [i.id, i]));

    const prepared = requested.map((line) => {
      const ordered = orderedByKey.get(`${line.ingredientId}:${line.unitId}`);
      if (!ordered) {
        throw new BadRequestException("Dòng nhập không khớp đơn mua");
      }
      const ing = ingById.get(line.ingredientId);
      if (!ing) throw new BadRequestException("Nguyên liệu không tồn tại");

      const factor = this.factorToBase(ing, line.unitId);
      const qtyBase = roundQty(line.qty * factor);
      if (!(qtyBase > 0)) throw new BadRequestException("Số lượng nhập không hợp lệ");

      const unitPriceVnd = line.unitPriceVnd ?? ordered.unitPriceVnd;
      // roundVnd wraps the product; qty is fractional so multiplyVnd (integer
      // count) does not apply.
      // eslint-disable-next-line money/no-unsafe-money-arithmetic -- roundVnd enforces the integer result
      const lineTotalVnd = roundVnd(unitPriceVnd * line.qty);
      // Cost per one base unit for the moving average.
      // eslint-disable-next-line money/no-unsafe-money-arithmetic -- roundVnd enforces the integer result
      const unitCostVnd = roundVnd(lineTotalVnd / qtyBase);
      return { ingredientId: line.ingredientId, qtyBase, unitCostVnd, lineTotalVnd };
    });

    return this.prisma.withTx(async (tx) => {
      const results = [];
      for (const p of prepared) {
        const b = await this.balance.applyDelta(tx, {
          branchId: po.branchId,
          ingredientId: p.ingredientId,
          type: "RECEIPT",
          qtyBase: p.qtyBase,
          unitCostVnd: p.unitCostVnd,
          refType: "PO",
          refId: po.id,
          createdBy: actorId,
        });
        results.push({
          ingredientId: p.ingredientId,
          receivedQtyBase: p.qtyBase,
          onHandQtyBase: b.qtyBase,
          avgCostVnd: b.avgCostVnd,
        });
      }

      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: "RECEIVED" } });
      await this.audit.record(tx, {
        actorId,
        actorRole: role,
        action: "stock.receipt",
        objectType: "purchase_order",
        objectId: po.id,
        branchId: po.branchId,
        after: { lineCount: results.length },
      });

      return { poId: po.id, status: "RECEIVED", received: results };
    });
  }

  /** How many base units one `unitId` equals for this ingredient. */
  private factorToBase(
    ingredient: { unitId: string; purchaseUnits: { unitId: string; factorToBase: unknown }[] },
    unitId: string,
  ): number {
    if (ingredient.unitId === unitId) return 1;
    const pu = ingredient.purchaseUnits.find((p) => p.unitId === unitId);
    if (!pu) throw new BadRequestException("Đơn vị không hợp lệ cho nguyên liệu");
    const factor = Number(pu.factorToBase);
    if (!(factor > 0)) throw new BadRequestException("Hệ số quy đổi không hợp lệ");
    return factor;
  }
}
