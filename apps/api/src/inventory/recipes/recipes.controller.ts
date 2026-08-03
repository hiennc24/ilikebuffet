/**
 * RecipesController — ticket-type recipe (định mức) endpoints under
 * /inventory/recipes.
 *
 * @Unscoped: BranchScopeGuard doesn't auto-check, so the service re-checks branch
 * access when a branchId scope is given (like keyless :id routes). The chain-wide
 * default (no branchId) is HQ/owner only; a per-branch override may also be set by
 * a branch manager for their own branch. Read is open to any authenticated user.
 */
import { Body, Controller, ForbiddenException, Get, Param, Put, Query, Request } from "@nestjs/common";
import { RecipesService } from "./recipes.service";
import { PermissionService } from "../../platform/rbac/permission.service";
import { Unscoped } from "../../platform/rbac/decorators";
import { assertBranchAccess } from "../../platform/rbac/branch-access";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import { SetRecipeDto, RecipeListQuery } from "./recipes.dto";

@Unscoped()
@Controller("inventory/recipes")
export class RecipesController {
  constructor(
    private readonly service: RecipesService,
    private readonly perms: PermissionService,
  ) {}

  @Get()
  list(@Query() query: RecipeListQuery, @Request() req: ScopedRequest) {
    // @Unscoped skips the guard; a branch override read must still be in scope.
    // The chain-wide default (no branchId) is readable config for any user.
    if (query.branchId) {
      assertBranchAccess({ chainWide: req.user.chainWide, branchIds: req.user.branchIds }, query.branchId);
    }
    return this.service.list(query.ticketTypeId, query.branchId);
  }

  @Put(":ticketTypeId")
  async setRecipe(
    @Param("ticketTypeId") ticketTypeId: string,
    @Query("branchId") branchId: string | undefined,
    @Body() dto: SetRecipeDto,
    @Request() req: ScopedRequest,
  ) {
    const scoped = branchId || undefined;
    const capability = scoped ? "recipe:manage-branch" : "recipe:manage-chain";
    if (!(await this.perms.can(req.user.role, capability))) {
      throw new ForbiddenException("Không có quyền sửa định mức");
    }
    return this.service.setRecipe(
      ticketTypeId,
      dto,
      req.user.sub,
      req.user.role,
      { chainWide: req.user.chainWide, branchIds: req.user.branchIds },
      scoped,
    );
  }
}
