/**
 * MasterDataController — HTTP endpoints.
 *
 * Role gates:
 *   - Ingredient groups, units, accounts, chain-wide suppliers: QUAN_TRI_HQ.
 *   - Branch-specific supplier create: QUAN_LY_CN (own branch) or HQ.
 *   - Reads: all authenticated; scoped by BranchScopeHelper for supplier lists.
 *
 * Suppliers use BranchScopeHelper.requireScope() so scoped users see only
 * their branch's + chain-wide suppliers.
 */
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
} from "@nestjs/common";
import { MasterDataService } from "./master-data.service";
import { Unscoped } from "../rbac/decorators";
import { Role } from "../rbac/role.enum";
import { BranchScopeHelper } from "../rbac/branch-scope.helper";
import type { ScopedRequest } from "../rbac/branch-scope.guard";
import {
  CreateUnitDto,
  CreateIngredientGroupDto,
  UpdateIngredientGroupDto,
  CreateIngredientDto,
  UpdateIngredientDto,
  IngredientListQuery,
  CreateAccountGroupDto,
  CreateAccountDto,
  UpdateAccountDto,
  AccountListQuery,
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierListQuery,
  CreateHolidayCalendarDto,
  UpsertHolidayEntriesDto,
} from "./master-data.dto";

// ─── Units ────────────────────────────────────────────────────────────────────

@Unscoped()
@Controller("master-data/units")
export class UnitController {
  constructor(private readonly service: MasterDataService) {}

  @Get()
  list() {
    return this.service.listUnits();
  }

  @Post()
  create(@Body() dto: CreateUnitDto, @Request() req: ScopedRequest) {
    requireHq(req);
    return this.service.createUnit(dto, req.user.sub, req.user.role);
  }
}

// ─── Ingredient Groups ────────────────────────────────────────────────────────

@Unscoped()
@Controller("master-data/ingredient-groups")
export class IngredientGroupController {
  constructor(private readonly service: MasterDataService) {}

  @Get()
  list() {
    return this.service.listIngredientGroups();
  }

  @Post()
  create(@Body() dto: CreateIngredientGroupDto, @Request() req: ScopedRequest) {
    requireHq(req);
    return this.service.createIngredientGroup(dto, req.user.sub, req.user.role);
  }

  @Put(":groupId")
  update(
    @Param("groupId") groupId: string,
    @Body() dto: UpdateIngredientGroupDto,
    @Request() req: ScopedRequest,
  ) {
    requireHq(req);
    return this.service.updateIngredientGroup(groupId, dto, req.user.sub, req.user.role);
  }
}

// ─── Ingredients ──────────────────────────────────────────────────────────────

@Unscoped()
@Controller("master-data/ingredients")
export class IngredientController {
  constructor(private readonly service: MasterDataService) {}

  @Get()
  list(@Query() query: IngredientListQuery) {
    return this.service.listIngredients(query);
  }

  @Get(":ingredientId")
  findOne(@Param("ingredientId") ingredientId: string) {
    return this.service.findOneIngredient(ingredientId);
  }

  @Post()
  create(@Body() dto: CreateIngredientDto, @Request() req: ScopedRequest) {
    requireHq(req);
    return this.service.createIngredient(dto, req.user.sub, req.user.role);
  }

  @Put(":ingredientId")
  update(
    @Param("ingredientId") ingredientId: string,
    @Body() dto: UpdateIngredientDto,
    @Request() req: ScopedRequest,
  ) {
    requireHq(req);
    return this.service.updateIngredient(ingredientId, dto, req.user.sub, req.user.role);
  }

  /** Deactivate (Ngừng sử dụng) — no hard delete. */
  @Delete(":ingredientId")
  deactivate(@Param("ingredientId") ingredientId: string, @Request() req: ScopedRequest) {
    requireHq(req);
    return this.service.deactivateIngredient(ingredientId, req.user.sub, req.user.role);
  }
}

// ─── Chart of accounts ────────────────────────────────────────────────────────

@Unscoped()
@Controller("master-data/accounts")
export class AccountController {
  constructor(private readonly service: MasterDataService) {}

  @Get("groups")
  listGroups() {
    return this.service.listAccountGroups();
  }

  @Post("groups")
  createGroup(@Body() dto: CreateAccountGroupDto, @Request() req: ScopedRequest) {
    requireHq(req);
    return this.service.createAccountGroup(dto, req.user.sub, req.user.role);
  }

  @Get()
  list(@Query() query: AccountListQuery) {
    return this.service.listAccounts(query);
  }

  @Post()
  create(@Body() dto: CreateAccountDto, @Request() req: ScopedRequest) {
    requireHq(req);
    return this.service.createAccount(dto, req.user.sub, req.user.role);
  }

  @Put(":accountId")
  update(
    @Param("accountId") accountId: string,
    @Body() dto: UpdateAccountDto,
    @Request() req: ScopedRequest,
  ) {
    requireHq(req);
    return this.service.updateAccount(accountId, dto, req.user.sub, req.user.role);
  }
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

@Controller("master-data/suppliers")
export class SupplierController {
  constructor(private readonly service: MasterDataService) {}

  /**
   * List suppliers. Scoped users see: chain-wide + own-branch.
   * Chain-wide users see all. Implemented via BranchScopeHelper.
   *
   * Uses BranchScopeHelper.requireScope(req) so any guard bypass is loud
   * (InternalServerError), not a silent full-table scan.
   */
  @Get()
  list(@Query() query: SupplierListQuery, @Request() req: ScopedRequest) {
    // requireScope() throws InternalServerErrorException if branchScope is absent.
    // For chain-wide users it returns undefined (no filter — see all).
    const branchFilter = BranchScopeHelper.requireScope(req);
    return this.service.listSuppliers(query, branchFilter);
  }

  /**
   * Create supplier.
   * - CHAIN_WIDE: HQ only.
   * - BRANCH_SPECIFIC: HQ or QUAN_LY_CN for their own branch.
   *
   * QUAN_LY_CN may also *edit* (PUT) their own branch-specific supplier once
   * Purchase Orders is delivered. For now PUT is HQ-only to keep the
   * blast radius minimal — a future phase will relax this gate when the
   * supplier-edit flow for branch managers is fully scoped and tested.
   *
   * BRANCH_SPECIFIC suppliers created by QL_CN start in PENDING_HQ status
   * but are immediately usable by the branch's Purchase Order workflow.
   */
  @Post()
  create(@Body() dto: CreateSupplierDto, @Request() req: ScopedRequest) {
    if (dto.scope === "CHAIN_WIDE" && req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ may create chain-wide suppliers");
    }
    if (
      dto.scope === "BRANCH_SPECIFIC" &&
      req.user.role !== Role.QUAN_TRI_HQ &&
      req.user.role !== Role.QUAN_LY_CN
    ) {
      throw new ForbiddenException(
        "Only QUAN_TRI_HQ or QUAN_LY_CN may create branch-specific suppliers",
      );
    }
    return this.service.createSupplier(
      dto,
      req.user.sub,
      req.user.role,
      req.user.role,
      req.user.branchIds,
    );
  }

  @Put(":supplierId")
  update(
    @Param("supplierId") supplierId: string,
    @Body() dto: UpdateSupplierDto,
    @Request() req: ScopedRequest,
  ) {
    requireHq(req);
    return this.service.updateSupplier(supplierId, dto, req.user.sub, req.user.role);
  }

  /** HQ approves a PENDING_HQ supplier. */
  @Patch(":supplierId/approve")
  approve(@Param("supplierId") supplierId: string, @Request() req: ScopedRequest) {
    requireHq(req);
    return this.service.approveSupplier(supplierId, req.user.sub, req.user.role);
  }

  /** Deactivate — no hard delete. */
  @Delete(":supplierId")
  deactivate(@Param("supplierId") supplierId: string, @Request() req: ScopedRequest) {
    requireHq(req);
    return this.service.deactivateSupplier(supplierId, req.user.sub, req.user.role);
  }
}

// ─── Holiday Calendar ─────────────────────────────────────────────────────────

@Unscoped()
@Controller("master-data/holiday-calendars")
export class HolidayCalendarController {
  constructor(private readonly service: MasterDataService) {}

  @Get()
  list(@Query("year") year?: string, @Query("branchId") branchId?: string) {
    return this.service.listHolidayCalendars(year ? Number(year) : undefined, branchId);
  }

  @Post()
  create(@Body() dto: CreateHolidayCalendarDto, @Request() req: ScopedRequest) {
    requireHq(req);
    return this.service.createHolidayCalendar(dto, req.user.sub, req.user.role);
  }

  @Put(":calendarId/entries")
  upsertEntries(
    @Param("calendarId") calendarId: string,
    @Body() dto: UpsertHolidayEntriesDto,
    @Request() req: ScopedRequest,
  ) {
    requireHq(req);
    return this.service.upsertHolidayEntries(calendarId, dto, req.user.sub, req.user.role);
  }
}

// ─── Shared guard helper ──────────────────────────────────────────────────────

function requireHq(req: ScopedRequest): void {
  if (req.user.role !== Role.QUAN_TRI_HQ) {
    throw new ForbiddenException("Only QUAN_TRI_HQ may manage master data");
  }
}
