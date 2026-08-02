/**
 * PurchaseOrdersService — create and manage purchase orders to suppliers.
 *
 * Branch-scoped: the caller's BranchAccess gates every read and write; routes
 * keyed only by :id re-check the order's branch here. Money is integer VND;
 * line totals are roundVnd(unitPriceVnd × qty) with fractional qty. Only DRAFT
 * orders are editable; send/cancel drive the DRAFT→SENT→(RECEIVED)/CANCELLED
 * lifecycle. Every mutation writes an audit row inside its transaction.
 */
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { roundVnd, sumVnd } from "@ilikebuffet/shared";
import { PrismaService, TxClient } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { assertBranchAccess, type BranchAccess } from "../../platform/rbac/branch-access";
import type {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderLineDto,
  PurchaseOrderListQuery,
} from "./purchase-orders.dto";

/** A PO with its lines and supplier, as loaded from the DB. */
type PoWithLines = Prisma.PurchaseOrderGetPayload<{
  include: {
    supplier: { select: { id: true; name: true } };
    lines: { include: { ingredient: { select: { name: true; code: true } }; unit: { select: { code: true; name: true } } } };
  };
}>;

const PO_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  lines: {
    include: {
      ingredient: { select: { name: true, code: true } },
      unit: { select: { code: true, name: true } },
    },
  },
} satisfies Prisma.PurchaseOrderInclude;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PurchaseOrderListQuery, access: BranchAccess) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status as Prisma.EnumPoStatusFilter["equals"] } : {}),
      ...(query.q ? { code: { contains: query.q, mode: "insensitive" } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: PO_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return { data: rows.map((r) => this.toView(r)), total };
  }

  async findOne(id: string, access: BranchAccess) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: PO_INCLUDE });
    if (!po) throw new NotFoundException("Không tìm thấy đơn mua");
    assertBranchAccess(access, po.branchId);
    return this.toView(po);
  }

  async create(dto: CreatePurchaseOrderDto, actorId: string, role: string, access: BranchAccess) {
    assertBranchAccess(access, dto.branchId);
    const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
    if (!branch) throw new NotFoundException("Không tìm thấy chi nhánh");
    await this.assertSupplier(dto.supplierId, dto.branchId);
    await this.assertLines(dto.lines);

    const lines = this.priceLines(dto.lines);

    // Retry the code allocation on the rare concurrent-collision (unique on code).
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.withTx(async (tx) => {
          const code = await this.nextCode(tx, branch.code, dto.branchId);
          const po = await tx.purchaseOrder.create({
            data: {
              code,
              branchId: dto.branchId,
              supplierId: dto.supplierId,
              note: dto.note ?? null,
              status: "DRAFT",
              createdBy: actorId,
              lines: { create: lines },
            },
            include: PO_INCLUDE,
          });
          await this.audit.record(tx, {
            actorId,
            actorRole: role,
            action: "purchase_order.created",
            objectType: "purchase_order",
            objectId: po.id,
            branchId: po.branchId,
            after: { code: po.code, supplierId: po.supplierId, totalVnd: this.totalOf(po) },
          });
          return this.toView(po);
        });
      } catch (e) {
        if (this.isCodeCollision(e) && attempt < 4) continue;
        throw e;
      }
    }
    // Unreachable: the loop either returns or throws.
    throw new BadRequestException("Không thể tạo mã đơn mua");
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    actorId: string,
    role: string,
    access: BranchAccess,
  ) {
    const existing = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Không tìm thấy đơn mua");
    assertBranchAccess(access, existing.branchId);
    if (existing.status !== "DRAFT") {
      throw new BadRequestException("Chỉ sửa được đơn mua ở trạng thái nháp");
    }
    if (dto.supplierId) await this.assertSupplier(dto.supplierId, existing.branchId);
    if (dto.lines) await this.assertLines(dto.lines);

    return this.prisma.withTx(async (tx) => {
      if (dto.lines) {
        await tx.purchaseOrderLine.deleteMany({ where: { poId: id } });
      }
      const po = await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: dto.supplierId ?? undefined,
          note: dto.note ?? undefined,
          ...(dto.lines ? { lines: { create: this.priceLines(dto.lines) } } : {}),
        },
        include: PO_INCLUDE,
      });
      await this.audit.record(tx, {
        actorId,
        actorRole: role,
        action: "purchase_order.updated",
        objectType: "purchase_order",
        objectId: po.id,
        branchId: po.branchId,
        after: { totalVnd: this.totalOf(po) },
      });
      return this.toView(po);
    });
  }

  send(id: string, actorId: string, role: string, access: BranchAccess) {
    return this.transition(id, actorId, role, access, {
      from: ["DRAFT"],
      to: "SENT",
      action: "purchase_order.sent",
      error: "Chỉ gửi được đơn mua ở trạng thái nháp",
    });
  }

  cancel(id: string, actorId: string, role: string, access: BranchAccess) {
    return this.transition(id, actorId, role, access, {
      from: ["DRAFT", "SENT"],
      to: "CANCELLED",
      action: "purchase_order.cancelled",
      error: "Chỉ huỷ được đơn mua ở trạng thái nháp hoặc đã gửi",
    });
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private async transition(
    id: string,
    actorId: string,
    role: string,
    access: BranchAccess,
    opts: { from: string[]; to: "SENT" | "CANCELLED"; action: string; error: string },
  ) {
    const existing = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Không tìm thấy đơn mua");
    assertBranchAccess(access, existing.branchId);
    if (!opts.from.includes(existing.status)) throw new BadRequestException(opts.error);

    return this.prisma.withTx(async (tx) => {
      const po = await tx.purchaseOrder.update({
        where: { id },
        data: { status: opts.to },
        include: PO_INCLUDE,
      });
      await this.audit.record(tx, {
        actorId,
        actorRole: role,
        action: opts.action,
        objectType: "purchase_order",
        objectId: po.id,
        branchId: po.branchId,
        before: { status: existing.status },
        after: { status: po.status },
      });
      return this.toView(po);
    });
  }

  /** Attach roundVnd(price × qty) line totals for persistence. */
  private priceLines(lines: PurchaseOrderLineDto[]) {
    return lines.map((l) => ({
      ingredientId: l.ingredientId,
      unitId: l.unitId,
      qty: l.qty,
      unitPriceVnd: l.unitPriceVnd,
      // roundVnd wraps the product to an integer đồng; qty is fractional (kg/lít)
      // so multiplyVnd (integer-count only) does not apply here.
      // eslint-disable-next-line money/no-unsafe-money-arithmetic -- roundVnd enforces the integer result
      lineTotalVnd: roundVnd(l.unitPriceVnd * l.qty),
    }));
  }

  private async assertSupplier(supplierId: string, branchId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || supplier.status !== "ACTIVE") {
      throw new BadRequestException("Nhà cung cấp không hợp lệ");
    }
    if (supplier.scope === "BRANCH_SPECIFIC" && supplier.branchId !== branchId) {
      throw new BadRequestException("Nhà cung cấp không thuộc chi nhánh này");
    }
  }

  /** Each line's ingredient must exist and its unit be the base or a purchase unit. */
  private async assertLines(lines: PurchaseOrderLineDto[]) {
    const ids = [...new Set(lines.map((l) => l.ingredientId))];
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ids } },
      include: { purchaseUnits: { select: { unitId: true } } },
    });
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    for (const l of lines) {
      const ing = byId.get(l.ingredientId);
      if (!ing) throw new BadRequestException(`Nguyên liệu không tồn tại: ${l.ingredientId}`);
      const isBase = ing.unitId === l.unitId;
      const isPurchase = ing.purchaseUnits.some((pu) => pu.unitId === l.unitId);
      if (!isBase && !isPurchase) {
        throw new BadRequestException(`Đơn vị không hợp lệ cho nguyên liệu ${ing.name}`);
      }
    }
  }

  /** Next per-branch code "PO-<branchCode>-NNNN" from the current count. */
  private async nextCode(tx: TxClient, branchCode: string, branchId: string): Promise<string> {
    const count = await tx.purchaseOrder.count({ where: { branchId } });
    return `PO-${branchCode}-${String(count + 1).padStart(4, "0")}`;
  }

  private isCodeCollision(e: unknown): boolean {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002" &&
      // target names the offending unique index/columns.
      String(e.meta?.target ?? "").includes("code")
    );
  }

  private totalOf(po: PoWithLines): number {
    return sumVnd(po.lines.map((l) => l.lineTotalVnd));
  }

  private toView(po: PoWithLines) {
    return {
      id: po.id,
      code: po.code,
      branchId: po.branchId,
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      status: po.status,
      note: po.note,
      createdBy: po.createdBy,
      createdAt: po.createdAt,
      totalVnd: this.totalOf(po),
      lines: po.lines.map((l) => ({
        id: l.id,
        ingredientId: l.ingredientId,
        ingredientName: l.ingredient.name,
        ingredientCode: l.ingredient.code,
        unitId: l.unitId,
        unitCode: l.unit.code,
        qty: Number(l.qty),
        unitPriceVnd: l.unitPriceVnd,
        lineTotalVnd: l.lineTotalVnd,
      })),
    };
  }
}
