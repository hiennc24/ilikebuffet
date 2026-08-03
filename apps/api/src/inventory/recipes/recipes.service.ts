/**
 * RecipesService — manage per-ticket-type ingredient recipes (định mức).
 *
 * Recipes are chain-wide config (no branch). PUT replaces a ticket type's whole
 * recipe in one transaction. Consumed at sale time by RecipeConsumptionService.
 */
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
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

  async list(ticketTypeId?: string) {
    const rows = await this.prisma.ticketTypeRecipe.findMany({
      where: ticketTypeId ? { ticketTypeId } : {},
      include: RECIPE_INCLUDE,
      orderBy: { ingredient: { name: "asc" } },
    });
    return { data: rows.map((r) => this.toView(r)) };
  }

  async setRecipe(ticketTypeId: string, dto: SetRecipeDto, actorId: string, role: string) {
    const ticketType = await this.prisma.ticketType.findUnique({ where: { id: ticketTypeId } });
    if (!ticketType) throw new NotFoundException("Không tìm thấy loại vé");

    const ids = dto.lines.map((l) => l.ingredientId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException("Nguyên liệu bị trùng trong định mức");
    }
    if (ids.length > 0) {
      const found = await this.prisma.ingredient.count({ where: { id: { in: ids } } });
      if (found !== new Set(ids).size) throw new BadRequestException("Nguyên liệu không tồn tại");
    }

    return this.prisma.withTx(async (tx) => {
      await tx.ticketTypeRecipe.deleteMany({ where: { ticketTypeId } });
      if (dto.lines.length > 0) {
        await tx.ticketTypeRecipe.createMany({
          data: dto.lines.map((l) => ({ ticketTypeId, ingredientId: l.ingredientId, qtyBase: l.qtyBase })),
        });
      }
      await this.audit.record(tx, {
        actorId,
        actorRole: role,
        action: "recipe.updated",
        objectType: "ticket_type",
        objectId: ticketTypeId,
        after: { lineCount: dto.lines.length },
      });
      const rows = await tx.ticketTypeRecipe.findMany({ where: { ticketTypeId }, include: RECIPE_INCLUDE });
      return { data: rows.map((r) => this.toView(r)) };
    });
  }

  private toView(r: RecipeRow) {
    return {
      id: r.id,
      ticketTypeId: r.ticketTypeId,
      ingredientId: r.ingredientId,
      ingredientName: r.ingredient.name,
      ingredientCode: r.ingredient.code,
      unitCode: r.ingredient.unit.code,
      qtyBase: Number(r.qtyBase),
    };
  }
}
