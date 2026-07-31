/**
 * MasterDataService — NT-03 master catalog management.
 *
 * Covers: Unit, IngredientGroup, Ingredient, AccountGroup, Account,
 *         Supplier (with HQ approval flow), HolidayCalendar.
 *
 * Invariants:
 *   - Already-transacted entities: no hard delete, deactivate only (NT-03.2).
 *   - Ingredient code: auto-generated if omitted; editable before first transaction.
 *     "First transaction" = any IngredientPurchaseUnit usage or (later) stock movement.
 *     For MVP with no stock tables yet the code is always editable (same extensible
 *     pattern as branchHasTransactions — ingredientHasTransactions() always false now).
 *   - Supplier scope: CHAIN_WIDE created by HQ; BRANCH_SPECIFIC by QL_CN for own branch
 *     → status PENDING_HQ, usable by that branch's PO immediately (NT-03.5).
 *   - HolidayCalendar: isHoliday(date, branchId?) checks branch calendar first,
 *     falls back to chain-wide (Red Team M2).
 *   - All sensitive changes audited in-tx.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { IngredientStatus, Prisma, SupplierScope, SupplierStatus } from "@prisma/client";
import { randomInt } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { assertVndInteger } from "@ilikebuffet/shared";
import type {
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

// ─── Ingredient transaction checker (extensible — same pattern as branch) ─────

export type IngredientTransactionChecker = (
  ingredientId: string,
  tx: Prisma.TransactionClient,
) => Promise<boolean>;

const ingredientTransactionCheckers: IngredientTransactionChecker[] = [
  // P7/KH will push stock movement / PO line checkers here.
];

export async function ingredientHasTransactions(
  ingredientId: string,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  for (const check of ingredientTransactionCheckers) {
    if (await check(ingredientId, tx)) return true;
  }
  return false;
}

export function registerIngredientTransactionChecker(
  checker: IngredientTransactionChecker,
): void {
  ingredientTransactionCheckers.push(checker);
}

// ─── Code generator ───────────────────────────────────────────────────────────

/**
 * Generate a unique ingredient code: "NL" + zero-padded 4-digit random number.
 *
 * M2 fix: exported so ExcelImportService reuses this helper instead of
 * duplicating the logic with Math.random(). Both callers now use crypto.randomInt.
 */
export async function generateIngredientCode(tx: Prisma.TransactionClient): Promise<string> {
  // Try up to 10 times to find an unused code.
  for (let attempt = 0; attempt < 10; attempt++) {
    const n = randomInt(1, 9999);
    const code = `NL${String(n).padStart(4, "0")}`;
    const exists = await tx.ingredient.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new BadRequestException("Could not generate a unique ingredient code — supply one manually");
}

// ─── FnB default chart-of-accounts seed ──────────────────────────────────────

const DEFAULT_ACCOUNTS: Array<{
  group: string;
  accounts: Array<{ name: string; flow: "INCOME" | "EXPENSE"; thresholdVnd: number }>;
}> = [
  {
    group: "Doanh thu",
    accounts: [
      { name: "Doanh thu bán vé", flow: "INCOME", thresholdVnd: 0 },
      { name: "Doanh thu dịch vụ khác", flow: "INCOME", thresholdVnd: 0 },
    ],
  },
  {
    group: "Chi phí nguyên liệu",
    accounts: [
      { name: "Mua nguyên liệu thực phẩm", flow: "EXPENSE", thresholdVnd: 5_000_000 },
      { name: "Mua nguyên liệu đồ uống", flow: "EXPENSE", thresholdVnd: 5_000_000 },
      { name: "Vật tư tiêu hao", flow: "EXPENSE", thresholdVnd: 2_000_000 },
    ],
  },
  {
    group: "Chi phí vận hành",
    accounts: [
      { name: "Lương nhân viên", flow: "EXPENSE", thresholdVnd: 0 },
      { name: "Thuê mặt bằng", flow: "EXPENSE", thresholdVnd: 50_000_000 },
      { name: "Điện nước", flow: "EXPENSE", thresholdVnd: 10_000_000 },
      { name: "Khấu hao thiết bị", flow: "EXPENSE", thresholdVnd: 0 },
    ],
  },
  {
    group: "Thu khác",
    accounts: [
      { name: "Hoàn tiền nhà cung cấp", flow: "INCOME", thresholdVnd: 0 },
      { name: "Thu nhập khác", flow: "INCOME", thresholdVnd: 0 },
    ],
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class MasterDataService implements OnModuleInit {
  private readonly logger = new Logger(MasterDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Idempotently seed the default FnB chart of accounts on module init (M1 fix).
   * Running on every boot is safe — seedDefaultAccounts() skips existing groups/accounts.
   */
  async onModuleInit(): Promise<void> {
    await this.seedDefaultAccounts();
  }

  // ─── Units ──────────────────────────────────────────────────────────────────

  async createUnit(dto: CreateUnitDto, actorId?: string, actorRole?: string) {
    const code = dto.code.toUpperCase();
    return this.prisma.withTx(async (tx) => {
      const unit = await tx.unit.create({ data: { code, name: dto.name } });
      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "unit.create",
        objectType: "unit",
        objectId: unit.id,
        after: { code, name: dto.name },
      });
      return unit;
    });
  }

  async listUnits() {
    return this.prisma.unit.findMany({ orderBy: { code: "asc" } });
  }

  // ─── Ingredient groups ───────────────────────────────────────────────────────

  async createIngredientGroup(
    dto: CreateIngredientGroupDto,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const group = await tx.ingredientGroup.create({
        data: {
          name: dto.name,
          defaultWastagePct: dto.defaultWastagePct ?? 0,
        },
      });
      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "ingredient_group.create",
        objectType: "ingredient_group",
        objectId: group.id,
        after: { name: dto.name, defaultWastagePct: dto.defaultWastagePct ?? 0 },
      });
      return group;
    });
  }

  async updateIngredientGroup(
    groupId: string,
    dto: UpdateIngredientGroupDto,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const existing = await tx.ingredientGroup.findUnique({ where: { id: groupId } });
      if (!existing) throw new NotFoundException(`Ingredient group ${groupId} not found`);

      const updated = await tx.ingredientGroup.update({
        where: { id: groupId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.defaultWastagePct !== undefined && { defaultWastagePct: dto.defaultWastagePct }),
        },
      });
      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "ingredient_group.update",
        objectType: "ingredient_group",
        objectId: groupId,
        before: { name: existing.name, defaultWastagePct: Number(existing.defaultWastagePct) },
        after: { name: updated.name, defaultWastagePct: Number(updated.defaultWastagePct) },
      });
      return updated;
    });
  }

  async listIngredientGroups() {
    return this.prisma.ingredientGroup.findMany({ orderBy: { name: "asc" } });
  }

  // ─── Ingredients ─────────────────────────────────────────────────────────────

  async createIngredient(
    dto: CreateIngredientDto,
    actorId?: string,
    actorRole?: string,
  ) {
    if ((dto.purchaseUnits?.length ?? 0) > 3) {
      throw new BadRequestException("An ingredient may have at most 3 purchase units (NT-03.1)");
    }
    this.validatePurchaseUnits(dto.purchaseUnits ?? []);

    return this.prisma.withTx(async (tx) => {
      const code = dto.code ?? (await generateIngredientCode(tx));

      const ingredient = await tx.ingredient.create({
        data: {
          code,
          name: dto.name,
          groupId: dto.groupId,
          unitId: dto.unitId,
          wastagePct: dto.wastagePct ?? null,
          defaultMinStock: dto.defaultMinStock ?? 0,
        },
      });

      if (dto.purchaseUnits && dto.purchaseUnits.length > 0) {
        await tx.ingredientPurchaseUnit.createMany({
          data: dto.purchaseUnits.map((pu) => ({
            ingredientId: ingredient.id,
            unitId: pu.unitId,
            factorToBase: pu.factorToBase,
          })),
        });
      }

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "ingredient.create",
        objectType: "ingredient",
        objectId: ingredient.id,
        after: { code, name: dto.name, groupId: dto.groupId },
      });

      return tx.ingredient.findUnique({
        where: { id: ingredient.id },
        include: { purchaseUnits: { include: { unit: true } }, unit: true, group: true },
      });
    });
  }

  async updateIngredient(
    ingredientId: string,
    dto: UpdateIngredientDto,
    actorId?: string,
    actorRole?: string,
  ) {
    if ((dto.purchaseUnits?.length ?? 0) > 3) {
      throw new BadRequestException("An ingredient may have at most 3 purchase units (NT-03.1)");
    }
    if (dto.purchaseUnits) this.validatePurchaseUnits(dto.purchaseUnits);

    return this.prisma.withTx(async (tx) => {
      const existing = await tx.ingredient.findUnique({ where: { id: ingredientId } });
      if (!existing) throw new NotFoundException(`Ingredient ${ingredientId} not found`);

      // Code immutability: block code change if ingredient has transactions.
      if (dto.code && dto.code !== existing.code) {
        const hasTransactions = await ingredientHasTransactions(ingredientId, tx);
        if (hasTransactions) {
          throw new ForbiddenException(
            "Ingredient code cannot be changed after transactions have been recorded",
          );
        }
        const codeConflict = await tx.ingredient.findFirst({
          where: { code: dto.code, id: { not: ingredientId } },
        });
        if (codeConflict) {
          throw new BadRequestException(`Ingredient code "${dto.code}" is already in use`);
        }
      }

      const updated = await tx.ingredient.update({
        where: { id: ingredientId },
        data: {
          ...(dto.code !== undefined && { code: dto.code }),
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.groupId !== undefined && { groupId: dto.groupId }),
          ...(dto.unitId !== undefined && { unitId: dto.unitId }),
          ...(dto.wastagePct !== undefined && { wastagePct: dto.wastagePct }),
          ...(dto.defaultMinStock !== undefined && { defaultMinStock: dto.defaultMinStock }),
        },
      });

      // Replace purchase units if provided (delete + re-create for simplicity).
      if (dto.purchaseUnits !== undefined) {
        await tx.ingredientPurchaseUnit.deleteMany({ where: { ingredientId } });
        if (dto.purchaseUnits.length > 0) {
          await tx.ingredientPurchaseUnit.createMany({
            data: dto.purchaseUnits.map((pu) => ({
              ingredientId,
              unitId: pu.unitId,
              factorToBase: pu.factorToBase,
            })),
          });
        }
      }

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "ingredient.update",
        objectType: "ingredient",
        objectId: ingredientId,
        before: { code: existing.code, name: existing.name },
        after: { code: updated.code, name: updated.name },
      });

      return tx.ingredient.findUnique({
        where: { id: ingredientId },
        include: { purchaseUnits: { include: { unit: true } }, unit: true, group: true },
      });
    });
  }

  async deactivateIngredient(
    ingredientId: string,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const existing = await tx.ingredient.findUnique({ where: { id: ingredientId } });
      if (!existing) throw new NotFoundException(`Ingredient ${ingredientId} not found`);

      const updated = await tx.ingredient.update({
        where: { id: ingredientId },
        data: { status: IngredientStatus.INACTIVE },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "ingredient.deactivate",
        objectType: "ingredient",
        objectId: ingredientId,
        before: { status: existing.status },
        after: { status: IngredientStatus.INACTIVE },
      });

      return updated;
    });
  }

  async listIngredients(query: IngredientListQuery) {
    const where: Prisma.IngredientWhereInput = {};
    if (query.groupId) where.groupId = query.groupId;
    if (query.status) where.status = query.status as IngredientStatus;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { code: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.ingredient.findMany({
        where,
        include: { group: true, unit: true, purchaseUnits: { include: { unit: true } } },
        orderBy: { name: "asc" },
        take: Math.min(query.limit ?? 50, 200),
        skip: query.offset ?? 0,
      }),
      this.prisma.ingredient.count({ where }),
    ]);

    return { data, total };
  }

  async findOneIngredient(ingredientId: string) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
      include: { group: true, unit: true, purchaseUnits: { include: { unit: true } } },
    });
    if (!ingredient) throw new NotFoundException(`Ingredient ${ingredientId} not found`);
    return ingredient;
  }

  // ─── Chart of accounts ───────────────────────────────────────────────────────

  async createAccountGroup(dto: CreateAccountGroupDto, actorId?: string, actorRole?: string) {
    return this.prisma.withTx(async (tx) => {
      const group = await tx.accountGroup.create({ data: { name: dto.name } });
      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "account_group.create",
        objectType: "account_group",
        objectId: group.id,
        after: { name: dto.name },
      });
      return group;
    });
  }

  async createAccount(dto: CreateAccountDto, actorId?: string, actorRole?: string) {
    const thresholdVnd = dto.approvalThresholdVnd ?? 0;
    assertVndInteger(thresholdVnd);

    return this.prisma.withTx(async (tx) => {
      const account = await tx.account.create({
        data: {
          groupId: dto.groupId,
          name: dto.name,
          flow: dto.flow,
          approvalThresholdVnd: thresholdVnd,
        },
        include: { group: true },
      });
      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "account.create",
        objectType: "account",
        objectId: account.id,
        after: { name: dto.name, flow: dto.flow, approvalThresholdVnd: thresholdVnd },
      });
      return account;
    });
  }

  async updateAccount(
    accountId: string,
    dto: UpdateAccountDto,
    actorId?: string,
    actorRole?: string,
  ) {
    if (dto.approvalThresholdVnd !== undefined) {
      assertVndInteger(dto.approvalThresholdVnd);
    }

    return this.prisma.withTx(async (tx) => {
      const existing = await tx.account.findUnique({ where: { id: accountId } });
      if (!existing) throw new NotFoundException(`Account ${accountId} not found`);

      const updated = await tx.account.update({
        where: { id: accountId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.flow !== undefined && { flow: dto.flow }),
          ...(dto.approvalThresholdVnd !== undefined && {
            approvalThresholdVnd: dto.approvalThresholdVnd,
          }),
        },
        include: { group: true },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "account.update",
        objectType: "account",
        objectId: accountId,
        before: {
          name: existing.name,
          flow: existing.flow,
          approvalThresholdVnd: existing.approvalThresholdVnd,
        },
        after: { name: updated.name, flow: updated.flow },
      });

      return updated;
    });
  }

  async listAccounts(query: AccountListQuery) {
    const where: Prisma.AccountWhereInput = {};
    if (query.groupId) where.groupId = query.groupId;
    if (query.flow) where.flow = query.flow;
    if (query.search) where.name = { contains: query.search, mode: "insensitive" };

    const [data, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        include: { group: true },
        orderBy: [{ group: { name: "asc" } }, { name: "asc" }],
        take: Math.min(query.limit ?? 100, 500),
        skip: query.offset ?? 0,
      }),
      this.prisma.account.count({ where }),
    ]);

    return { data, total };
  }

  async listAccountGroups() {
    return this.prisma.accountGroup.findMany({
      include: { accounts: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Seed the default FnB chart of accounts (idempotent).
   * Called during onModuleInit or via a migration seed script.
   * Skips any group/account that already exists by name.
   */
  async seedDefaultAccounts(): Promise<void> {
    for (const grpDef of DEFAULT_ACCOUNTS) {
      let group = await this.prisma.accountGroup.findUnique({ where: { name: grpDef.group } });
      if (!group) {
        group = await this.prisma.accountGroup.create({ data: { name: grpDef.group } });
        this.logger.log(`Seeded account group: ${grpDef.group}`);
      }
      for (const acc of grpDef.accounts) {
        const existing = await this.prisma.account.findFirst({
          where: { groupId: group.id, name: acc.name },
        });
        if (!existing) {
          await this.prisma.account.create({
            data: {
              groupId: group.id,
              name: acc.name,
              flow: acc.flow,
              approvalThresholdVnd: acc.thresholdVnd,
            },
          });
          this.logger.log(`Seeded account: ${acc.name} (${acc.flow})`);
        }
      }
    }
  }

  // ─── Suppliers ───────────────────────────────────────────────────────────────

  async createSupplier(
    dto: CreateSupplierDto,
    actorId?: string,
    actorRole?: string,
    callerRole?: string,
    callerBranchIds?: string[],
  ) {
    return this.prisma.withTx(async (tx) => {
      // NT-03.5: QL_CN creates BRANCH_SPECIFIC → PENDING_HQ, usable immediately.
      let status: SupplierStatus = SupplierStatus.ACTIVE;
      if (dto.scope === "BRANCH_SPECIFIC") {
        if (!dto.branchId) {
          throw new BadRequestException("branchId required for BRANCH_SPECIFIC supplier");
        }
        // QL_CN can only create for their own branch.
        if (callerBranchIds && !callerBranchIds.includes(dto.branchId)) {
          throw new ForbiddenException(
            "QUAN_LY_CN can only create suppliers scoped to their own branch",
          );
        }
        status = SupplierStatus.PENDING_HQ;
      }

      const supplier = await tx.supplier.create({
        data: {
          name: dto.name,
          taxCode: dto.taxCode ?? null,
          contact: dto.contact ?? null,
          debtTerms: dto.debtTerms ?? 0,
          scope: dto.scope as SupplierScope,
          status,
          branchId: dto.branchId ?? null,
        },
      });

      if (dto.ingredientIds && dto.ingredientIds.length > 0) {
        await tx.supplierIngredient.createMany({
          data: dto.ingredientIds.map((ingredientId) => ({
            supplierId: supplier.id,
            ingredientId,
          })),
          skipDuplicates: true,
        });
      }

      await this.audit.record(tx, {
        actorId,
        actorRole: actorRole ?? callerRole,
        action: "supplier.create",
        objectType: "supplier",
        objectId: supplier.id,
        branchId: dto.branchId,
        after: { name: dto.name, scope: dto.scope, status },
      });

      this.logger.log(`Supplier created: id=${supplier.id} scope=${dto.scope} status=${status}`);
      return supplier;
    });
  }

  async approveSupplier(supplierId: string, actorId?: string, actorRole?: string) {
    return this.prisma.withTx(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) throw new NotFoundException(`Supplier ${supplierId} not found`);
      if (supplier.status !== SupplierStatus.PENDING_HQ) {
        throw new BadRequestException("Supplier is not in PENDING_HQ status");
      }

      const updated = await tx.supplier.update({
        where: { id: supplierId },
        data: { status: SupplierStatus.ACTIVE },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "supplier.approve",
        objectType: "supplier",
        objectId: supplierId,
        before: { status: supplier.status },
        after: { status: SupplierStatus.ACTIVE },
      });

      return updated;
    });
  }

  async updateSupplier(
    supplierId: string,
    dto: UpdateSupplierDto,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const existing = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!existing) throw new NotFoundException(`Supplier ${supplierId} not found`);

      const updated = await tx.supplier.update({
        where: { id: supplierId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.taxCode !== undefined && { taxCode: dto.taxCode }),
          ...(dto.contact !== undefined && { contact: dto.contact }),
          ...(dto.debtTerms !== undefined && { debtTerms: dto.debtTerms }),
        },
      });

      if (dto.ingredientIds !== undefined) {
        // Replace ingredient links.
        await tx.supplierIngredient.deleteMany({ where: { supplierId } });
        if (dto.ingredientIds.length > 0) {
          await tx.supplierIngredient.createMany({
            data: dto.ingredientIds.map((ingredientId) => ({ supplierId, ingredientId })),
            skipDuplicates: true,
          });
        }
      }

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "supplier.update",
        objectType: "supplier",
        objectId: supplierId,
        before: { name: existing.name },
        after: { name: updated.name },
      });

      return updated;
    });
  }

  async deactivateSupplier(supplierId: string, actorId?: string, actorRole?: string) {
    return this.prisma.withTx(async (tx) => {
      const existing = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!existing) throw new NotFoundException(`Supplier ${supplierId} not found`);

      const updated = await tx.supplier.update({
        where: { id: supplierId },
        data: { status: SupplierStatus.INACTIVE },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "supplier.deactivate",
        objectType: "supplier",
        objectId: supplierId,
        before: { status: existing.status },
        after: { status: SupplierStatus.INACTIVE },
      });

      return updated;
    });
  }

  async listSuppliers(query: SupplierListQuery, branchFilter?: string | { in: string[] }) {
    const where: Prisma.SupplierWhereInput = {};
    if (query.status) where.status = query.status as SupplierStatus;
    if (query.scope) where.scope = query.scope as SupplierScope;
    if (query.search) where.name = { contains: query.search, mode: "insensitive" };

    // Branch scope enforcement: scoped users see their branch's suppliers PLUS chain-wide.
    if (branchFilter !== undefined) {
      where.OR = [
        { scope: SupplierScope.CHAIN_WIDE },
        { branchId: branchFilter as string },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: { ingredients: { include: { ingredient: true } } },
        orderBy: { name: "asc" },
        take: Math.min(query.limit ?? 50, 200),
        skip: query.offset ?? 0,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return { data, total };
  }

  // ─── Holiday Calendar (Red Team M2) ──────────────────────────────────────────

  async createHolidayCalendar(
    dto: CreateHolidayCalendarDto,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const calendar = await tx.holidayCalendar.create({
        data: {
          year: dto.year,
          name: dto.name,
          branchId: dto.branchId ?? null,
        },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "holiday_calendar.create",
        objectType: "holiday_calendar",
        objectId: calendar.id,
        branchId: dto.branchId,
        after: { year: dto.year, name: dto.name, branchId: dto.branchId },
      });

      return calendar;
    });
  }

  async upsertHolidayEntries(
    calendarId: string,
    dto: UpsertHolidayEntriesDto,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const calendar = await tx.holidayCalendar.findUnique({ where: { id: calendarId } });
      if (!calendar) throw new NotFoundException(`Holiday calendar ${calendarId} not found`);

      // Delete existing entries and replace (simple replace for MVP).
      await tx.holidayEntry.deleteMany({ where: { calendarId } });

      const entries = await tx.holidayEntry.createMany({
        data: dto.entries.map((e) => ({
          calendarId,
          date: new Date(e.date),
          name: e.name,
          isCustom: e.isCustom ?? false,
        })),
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "holiday_calendar.entries_upsert",
        objectType: "holiday_calendar",
        objectId: calendarId,
        after: { entryCount: entries.count },
      });

      return tx.holidayCalendar.findUnique({
        where: { id: calendarId },
        include: { entries: { orderBy: { date: "asc" } } },
      });
    });
  }

  async listHolidayCalendars(year?: number, branchId?: string) {
    const where: Prisma.HolidayCalendarWhereInput = {};
    if (year !== undefined) where.year = year;
    if (branchId !== undefined) where.branchId = branchId;

    return this.prisma.holidayCalendar.findMany({
      where,
      include: { entries: { orderBy: { date: "asc" } } },
      orderBy: [{ year: "desc" }, { branchId: "asc" }],
    });
  }

  /**
   * Check if `date` is a holiday for `branchId` (or chain-wide if null).
   *
   * Lookup order: branch calendar → chain-wide calendar (Red Team M2 dependency
   * for P6 day-type pricing and P8 offline price cache).
   *
   * H1 fix: both `year` and the YYYY-MM-DD key are derived from a SINGLE
   * `Asia/Ho_Chi_Minh` normalisation so they cannot drift (e.g. 31 Dec UTC+0
   * is 1 Jan +7, which is 2026-01-01 in VN local time — the year AND the date
   * string must agree on the same calendar day).
   *
   * Exported as a public helper so P6 can call MasterDataService.isHoliday() directly.
   */
  async isHoliday(date: Date, branchId?: string): Promise<boolean> {
    // Derive YYYY-MM-DD and year from a single Asia/Ho_Chi_Minh normalisation (H1).
    // Intl.DateTimeFormat is available in all Node 16+ versions without extra packages.
    const vnDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date); // produces "YYYY-MM-DD" in en-CA locale

    const year = Number(vnDateStr.slice(0, 4));
    const lookupDate = new Date(`${vnDateStr}T00:00:00.000Z`);

    // Try branch-specific calendar first.
    if (branchId) {
      const cal = await this.prisma.holidayCalendar.findUnique({
        where: { year_branchId: { year, branchId } },
        include: { entries: { where: { date: lookupDate } } },
      });
      if (cal && cal.entries.length > 0) return true;
    }

    // Fall back to chain-wide calendar (branchId IS NULL in DB).
    const chainCal = await this.prisma.holidayCalendar.findFirst({
      where: { year, branchId: null },
      include: { entries: { where: { date: lookupDate } } },
    });
    return Boolean(chainCal && chainCal.entries.length > 0);
  }

  // ─── Validation helpers ───────────────────────────────────────────────────────

  private validatePurchaseUnits(
    pus: Array<{ unitId: string; factorToBase: number }>,
  ): void {
    for (const pu of pus) {
      if (pu.factorToBase <= 0) {
        throw new BadRequestException(
          `Purchase unit conversion factor must be > 0 (got ${pu.factorToBase})`,
        );
      }
    }
  }
}
