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
import { Unscoped } from "../../platform/rbac/decorators";
import { Role } from "../../platform/rbac/role.enum";
import { assertBranchAccess } from "../../platform/rbac/branch-access";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import { SetRecipeDto, RecipeListQuery } from "./recipes.dto";

/** Chain-wide default recipe — chain config roles only. */
const RECIPE_CHAIN_ROLES = new Set<Role>([Role.QUAN_TRI_HQ, Role.CHU_CHUOI]);
/** Per-branch override — chain config roles plus the branch manager. */
const RECIPE_BRANCH_ROLES = new Set<Role>([Role.QUAN_TRI_HQ, Role.CHU_CHUOI, Role.QUAN_LY_CN]);

@Unscoped()
@Controller("inventory/recipes")
export class RecipesController {
  constructor(private readonly service: RecipesService) {}

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
  setRecipe(
    @Param("ticketTypeId") ticketTypeId: string,
    @Query("branchId") branchId: string | undefined,
    @Body() dto: SetRecipeDto,
    @Request() req: ScopedRequest,
  ) {
    const role = req.user.role as Role;
    const scoped = branchId || undefined;
    const allowed = scoped ? RECIPE_BRANCH_ROLES.has(role) : RECIPE_CHAIN_ROLES.has(role);
    if (!allowed) throw new ForbiddenException("Không có quyền sửa định mức");
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
