/**
 * RecipesController — ticket-type recipe (định mức) endpoints under
 * /inventory/recipes. Chain-wide config (@Unscoped, no branch); write gated to
 * HQ + chain owner. Read open to any authenticated user (config visibility).
 */
import { Body, Controller, ForbiddenException, Get, Param, Put, Query, Request } from "@nestjs/common";
import { RecipesService } from "./recipes.service";
import { Unscoped } from "../../platform/rbac/decorators";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { SetRecipeDto, RecipeListQuery } from "./recipes.dto";

const RECIPE_WRITE_ROLES = new Set<Role>([Role.QUAN_TRI_HQ, Role.CHU_CHUOI]);

@Unscoped()
@Controller("inventory/recipes")
export class RecipesController {
  constructor(private readonly service: RecipesService) {}

  @Get()
  list(@Query() query: RecipeListQuery) {
    return this.service.list(query.ticketTypeId);
  }

  @Put(":ticketTypeId")
  setRecipe(@Param("ticketTypeId") ticketTypeId: string, @Body() dto: SetRecipeDto, @Request() req: ScopedRequest) {
    if (!RECIPE_WRITE_ROLES.has(req.user.role as Role)) {
      throw new ForbiddenException("Không có quyền sửa định mức");
    }
    return this.service.setRecipe(ticketTypeId, dto, req.user.sub, req.user.role);
  }
}
