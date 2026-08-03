/**
 * StockTransfersService — atomic inter-branch stock transfers (M10).
 *
 * On create, each line ISSUEs from the source branch (blocked below zero — a
 * transfer is a real move, not an estimate) and RECEIPTs into the destination at
 * the SOURCE's moving-average cost, all in one transaction. Both legs are
 * StockMovements tagged refType "TRANSFER" + refId = the transfer id, so the
 * `balance == Σ movements` invariant holds on both branches. The caller must have
 * branch access to BOTH ends. Moving-average logic is unchanged (reused).
 */
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService, TxClient } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { assertBranchAccess, type BranchAccess } from "../../platform/rbac/branch-access";
import { InventoryBalanceService } from "../inventory-balance.service";
import type { CreateTransferDto, TransferListQuery } from "./stock-transfers.dto";

const REF_TRANSFER = "TRANSFER";

type TransferWithLines = Prisma.StockTransferGetPayload<{ include: { lines: true } }>;

@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly balance: InventoryBalanceService,
  ) {}

  async create(dto: CreateTransferDto, actorId: string, role: string, access: BranchAccess) {
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException("Chi nhánh nguồn và đích phải khác nhau");
    }
    assertBranchAccess(access, dto.fromBranchId);
    assertBranchAccess(access, dto.toBranchId);

    const fromBranch = await this.prisma.branch.findUnique({ where: { id: dto.fromBranchId } });
    const toBranch = await this.prisma.branch.findUnique({ where: { id: dto.toBranchId } });
    if (!fromBranch || !toBranch) throw new NotFoundException("Không tìm thấy chi nhánh");
    await this.assertIngredients(dto.lines.map((l) => l.ingredientId));

    // Process lines in a stable ingredient order to reduce lock contention.
    const lines = [...dto.lines].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.withTx(async (tx) => {
          const code = await this.nextCode(tx, fromBranch.code, dto.fromBranchId);
          const transfer = await tx.stockTransfer.create({
            data: { code, fromBranchId: dto.fromBranchId, toBranchId: dto.toBranchId, note: dto.note ?? null, createdBy: actorId },
          });

          for (const line of lines) {
            // ISSUE from source (blocks negative). ISSUE leaves the average
            // unchanged, so the returned avg is the source unit cost to carry.
            const src = await this.balance.applyDelta(tx, {
              branchId: dto.fromBranchId,
              ingredientId: line.ingredientId,
              type: "ISSUE",
              qtyBase: -line.qtyBase,
              refType: REF_TRANSFER,
              refId: transfer.id,
              createdBy: actorId,
            });
            const unitCostVnd = src.avgCostVnd;
            await this.balance.applyDelta(tx, {
              branchId: dto.toBranchId,
              ingredientId: line.ingredientId,
              type: "RECEIPT",
              qtyBase: line.qtyBase,
              unitCostVnd,
              refType: REF_TRANSFER,
              refId: transfer.id,
              createdBy: actorId,
            });
            await tx.stockTransferLine.create({
              data: { transferId: transfer.id, ingredientId: line.ingredientId, qtyBase: line.qtyBase, unitCostVnd },
            });
          }

          await this.audit.record(tx, {
            actorId,
            actorRole: role,
            action: "stock.transfer",
            objectType: "stock_transfer",
            objectId: transfer.id,
            branchId: dto.fromBranchId,
            after: { code, fromBranchId: dto.fromBranchId, toBranchId: dto.toBranchId, lineCount: lines.length },
          });

          const full = await tx.stockTransfer.findUnique({ where: { id: transfer.id }, include: { lines: true } });
          return this.toView(full!, fromBranch.code, toBranch.code);
        });
      } catch (e) {
        if (this.isCodeCollision(e) && attempt < 4) continue;
        throw e;
      }
    }
    throw new BadRequestException("Không thể tạo mã phiếu chuyển");
  }

  async list(query: TransferListQuery, access: BranchAccess) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const scoped = access.chainWide
      ? {}
      : { OR: [{ fromBranchId: { in: access.branchIds } }, { toBranchId: { in: access.branchIds } }] };
    const where: Prisma.StockTransferWhereInput = {
      ...scoped,
      ...(query.branchId ? { OR: [{ fromBranchId: query.branchId }, { toBranchId: query.branchId }] } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({ where, include: { lines: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    const codeById = await this.branchCodes(rows.flatMap((r) => [r.fromBranchId, r.toBranchId]));
    return { data: rows.map((r) => this.toView(r, codeById.get(r.fromBranchId) ?? r.fromBranchId, codeById.get(r.toBranchId) ?? r.toBranchId)), total };
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private async assertIngredients(ids: string[]) {
    const unique = [...new Set(ids)];
    const found = await this.prisma.ingredient.count({ where: { id: { in: unique } } });
    if (found !== unique.length) throw new BadRequestException("Nguyên liệu không tồn tại");
  }

  private async nextCode(tx: TxClient, branchCode: string, branchId: string): Promise<string> {
    const count = await tx.stockTransfer.count({ where: { fromBranchId: branchId } });
    return `TR-${branchCode}-${String(count + 1).padStart(4, "0")}`;
  }

  private isCodeCollision(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String(e.meta?.target ?? "").includes("code");
  }

  private async branchCodes(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    const branches = await this.prisma.branch.findMany({ where: { id: { in: unique } }, select: { id: true, code: true } });
    return new Map(branches.map((b) => [b.id, b.code]));
  }

  private toView(t: TransferWithLines, fromCode: string, toCode: string) {
    return {
      id: t.id,
      code: t.code,
      fromBranchId: t.fromBranchId,
      fromBranchCode: fromCode,
      toBranchId: t.toBranchId,
      toBranchCode: toCode,
      note: t.note,
      createdAt: t.createdAt,
      lines: t.lines.map((l) => ({ id: l.id, ingredientId: l.ingredientId, qtyBase: Number(l.qtyBase), unitCostVnd: l.unitCostVnd })),
    };
  }
}
