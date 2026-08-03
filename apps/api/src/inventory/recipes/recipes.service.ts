/**
 * RecipesService — manage per-ticket-type ingredient recipes (định mức).
 *
 * A recipe is scoped: branchId null is the chain-wide default; a branch id is
 * that branch's override (M7). PUT replaces a ticket type's whole recipe for the
 * chosen scope in one transaction. Consumed at sale time by
 * RecipeConsumptionService, which prefers the branch override and falls back to
 * chain-wide.
 */
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { assertBranchAccess, type BranchAccess } from "../../platform/rbac/branch-access";
import type { SetRecipeDto } from "./recipes.dto";

const RECIPE_INCLUDE = {
  ingredient: { select: { name: true, code: true, unit: { select: { code: true } } } },
} satisfies Prisma.TicketTypeRecipeInclude;

type RecipeRow = Prisma.TicketTypeRecipeGetPayload<{ include: typeof RECIPE_INCLUDE }>;

@Injectable()
export class RecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** List recipe rows for one scope: branchId null = chain-wide default, else
   *  a branch's override. */
  async list(ticketTypeId?: string, branchId?: string) {
    const rows = await this.prisma.ticketTypeRecipe.findMany({
      where: { ...(ticketTypeId ? { ticketTypeId } : {}), branchId: branchId ?? null },
      include: RECIPE_INCLUDE,
      orderBy: { ingredient: { name: "asc" } },
    });
    return { data: rows.map((r) => this.toView(r)) };
  }

  /** Replace the whole recipe for (ticketType, scope). branchId set = a branch
   *  override (access-checked); null = the chain-wide default. */
  async setRecipe(
    ticketTypeId: string,
    dto: SetRecipeDto,
    actorId: string,
    role: string,
    access: BranchAccess,
    branchId?: string,
  ) {
    const ticketType = await this.prisma.ticketType.findUnique({ where: { id: ticketTypeId } });
    if (!ticketType) throw new NotFoundException("Không tìm thấy loại vé");

    if (branchId) {
      assertBranchAccess(access, branchId);
      const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch) throw new NotFoundException("Không tìm thấy chi nhánh");
    }

    const ids = dto.lines.map((l) => l.ingredientId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException("Nguyên liệu bị trùng trong định mức");
    }
    if (ids.length > 0) {
      const found = await this.prisma.ingredient.count({ where: { id: { in: ids } } });
      if (found !== new Set(ids).size) throw new BadRequestException("Nguyên liệu không tồn tại");
    }

    const scope = branchId ?? null;
    return this.prisma.withTx(async (tx) => {
      await tx.ticketTypeRecipe.deleteMany({ where: { ticketTypeId, branchId: scope } });
      if (dto.lines.length > 0) {
        await tx.ticketTypeRecipe.createMany({
          data: dto.lines.map((l) => ({ ticketTypeId, ingredientId: l.ingredientId, qtyBase: l.qtyBase, branchId: scope })),
        });
      }
      await this.audit.record(tx, {
        actorId,
        actorRole: role,
        action: "recipe.updated",
        objectType: "ticket_type",
        objectId: ticketTypeId,
        branchId: scope,
        after: { lineCount: dto.lines.length, scope: scope ?? "chain-wide" },
      });
      const rows = await tx.ticketTypeRecipe.findMany({ where: { ticketTypeId, branchId: scope }, include: RECIPE_INCLUDE });
      return { data: rows.map((r) => this.toView(r)) };
    });
  }

  private toView(r: RecipeRow) {
    return {
      id: r.id,
      ticketTypeId: r.ticketTypeId,
      ingredientId: r.ingredientId,
      branchId: r.branchId,
      ingredientName: r.ingredient.name,
      ingredientCode: r.ingredient.code,
      unitCode: r.ingredient.unit.code,
      qtyBase: Number(r.qtyBase),
    };
  }
}
