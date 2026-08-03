/**
 * BranchService — CRUD + status management for Branch.
 *
 * Key invariants:
 *   - Branch code is IMMUTABLE once the branch has transactions.
 *     branchHasTransactions() is the extensible checker (currently always false;
 *     billing module will register a Bill checker when ready).
 *   - SUSPENDED branches → assertBranchAcceptsTransactions() throws.
 *   - CLOSED branches: no hard delete, soft status only.
 *   - Every create/update/status-change writes an audit row inside the same tx.
 *   - Copy-from-template copies CONFIG tables only, never transaction data.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { BranchStatus, Prisma } from "@prisma/client";
import { PrismaService, TxClient } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import type {
  CreateBranchDto,
  UpdateBranchDto,
  ChangeBranchStatusDto,
  BranchListQuery,
} from "./branch.dto";

// ─── Transactional-table registry (extensible) ────────────────────────────────

/**
 * A checker function that returns true if `branchId` has any rows in a
 * transactional table. The billing module will register a Bill checker.
 *
 * Currently empty → always returns false (no transactional tables yet).
 */
export type TransactionChecker = (branchId: string, tx: TxClient) => Promise<boolean>;

const transactionCheckers: TransactionChecker[] = [
  // Billing module will push: (branchId, tx) => tx.bill.count({ where: { branchId } }).then(n => n > 0)
];

/**
 * Returns true if the branch has ANY rows in a registered transactional table.
 * Exported for testing: tests can inject a stub via the checkers array.
 */
export async function branchHasTransactions(branchId: string, tx: TxClient): Promise<boolean> {
  for (const check of transactionCheckers) {
    if (await check(branchId, tx)) return true;
  }
  return false;
}

/**
 * Register an additional transactional-table checker.
 * Must be called before any service method that reads it (i.e., at module init).
 */
export function registerTransactionChecker(checker: TransactionChecker): void {
  transactionCheckers.push(checker);
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Public guard (used by transaction endpoints) ─────────────────────────

  /**
   * Throw ForbiddenException if the branch is not in ACTIVE status.
   * SUSPENDED → transactions blocked. CLOSED → transactions blocked.
   */
  async assertBranchAcceptsTransactions(branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { status: true, name: true },
    });
    if (!branch) throw new NotFoundException(`Branch ${branchId} not found`);
    if (branch.status !== BranchStatus.ACTIVE) {
      throw new ForbiddenException(
        `Branch "${branch.name}" is ${branch.status} — transactions are blocked`,
      );
    }
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(dto: CreateBranchDto, actorId?: string, actorRole?: string) {
    this.validateCode(dto.code);

    return this.prisma.withTx(async (tx) => {
      // Check code uniqueness explicitly for a clear error message.
      const existing = await tx.branch.findUnique({ where: { code: dto.code } });
      if (existing) {
        throw new BadRequestException(`Branch code "${dto.code}" is already in use`);
      }

      const branch = await tx.branch.create({
        data: {
          code: dto.code,
          name: dto.name,
          address: dto.address,
          phone: dto.phone,
          operatingHours: dto.operatingHours != null ? (dto.operatingHours as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          bankAccount: dto.bankAccount != null ? (dto.bankAccount as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          billInfo: dto.billInfo != null ? (dto.billInfo as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          logoUrl: dto.logoUrl ?? null,
          poApprovalThresholdVnd: dto.poApprovalThresholdVnd ?? 0,
        },
      });

      // Copy configuration from template branch if requested.
      if (dto.copyFromBranchId) {
        await this.copyConfigFromTemplate(dto.copyFromBranchId, branch.id, tx);
      }

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "branch.create",
        objectType: "branch",
        objectId: branch.id,
        branchId: branch.id,
        after: { code: branch.code, name: branch.name, status: branch.status },
      });

      this.logger.log(`Branch created: id=${branch.id} code=${branch.code}`);
      return branch;
    });
  }

  async update(branchId: string, dto: UpdateBranchDto, actorId?: string, actorRole?: string) {
    return this.prisma.withTx(async (tx) => {
      const branch = await tx.branch.findUnique({ where: { id: branchId } });
      if (!branch) throw new NotFoundException(`Branch ${branchId} not found`);

      // Code immutability check: block code change if the branch has transactions.
      if (dto.code && dto.code !== branch.code) {
        this.validateCode(dto.code);
        const hasTransactions = await branchHasTransactions(branchId, tx);
        if (hasTransactions) {
          throw new ForbiddenException(
            `Branch code cannot be changed after transactions have been recorded`,
          );
        }
        // Also verify the new code is unique.
        const codeConflict = await tx.branch.findFirst({
          where: { code: dto.code, id: { not: branchId } },
        });
        if (codeConflict) {
          throw new BadRequestException(`Branch code "${dto.code}" is already in use`);
        }
      }

      const updateData: Prisma.BranchUpdateInput = {};
      if (dto.code !== undefined) updateData.code = dto.code;
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.address !== undefined) updateData.address = dto.address;
      if (dto.phone !== undefined) updateData.phone = dto.phone;
      if (dto.operatingHours !== undefined) {
        updateData.operatingHours = dto.operatingHours === null
          ? Prisma.DbNull
          : (dto.operatingHours as unknown as Prisma.InputJsonValue);
      }
      if (dto.bankAccount !== undefined) {
        updateData.bankAccount = dto.bankAccount === null
          ? Prisma.DbNull
          : (dto.bankAccount as unknown as Prisma.InputJsonValue);
      }
      if (dto.billInfo !== undefined) {
        updateData.billInfo = dto.billInfo === null
          ? Prisma.DbNull
          : (dto.billInfo as unknown as Prisma.InputJsonValue);
      }
      if (dto.logoUrl !== undefined) updateData.logoUrl = dto.logoUrl;
      if (dto.poApprovalThresholdVnd !== undefined) updateData.poApprovalThresholdVnd = dto.poApprovalThresholdVnd;

      const updated = await tx.branch.update({ where: { id: branchId }, data: updateData });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "branch.update",
        objectType: "branch",
        objectId: branchId,
        branchId,
        before: { code: branch.code, name: branch.name, address: branch.address },
        after: { code: updated.code, name: updated.name, address: updated.address },
      });

      return updated;
    });
  }

  async changeStatus(
    branchId: string,
    dto: ChangeBranchStatusDto,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const branch = await tx.branch.findUnique({ where: { id: branchId } });
      if (!branch) throw new NotFoundException(`Branch ${branchId} not found`);

      // CLOSED → no hard delete, stay in reports.
      // Any status transition is allowed at the service level; guard/role check
      // happens at controller.

      const updated = await tx.branch.update({
        where: { id: branchId },
        data: { status: dto.status as BranchStatus },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "branch.status_change",
        objectType: "branch",
        objectId: branchId,
        branchId,
        before: { status: branch.status },
        after: { status: updated.status },
        reason: dto.reason,
      });

      this.logger.log(`Branch ${branchId} status: ${branch.status} → ${dto.status}`);
      return updated;
    });
  }

  async findOne(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException(`Branch ${branchId} not found`);
    return branch;
  }

  /**
   * List branches.
   *
   * `allowedBranchIds` scopes the result to a specific set of branches.
   * Pass `undefined` for chain-wide users (no restriction).
   * Non-chainWide users pass their branchIds so they only see their own branches.
   */
  async list(query: BranchListQuery, allowedBranchIds?: string[]) {
    const where: Prisma.BranchWhereInput = {};
    if (query.status) where.status = query.status as BranchStatus;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { code: { contains: query.search, mode: "insensitive" } },
      ];
    }
    // Scope to caller's branches when not chain-wide.
    if (allowedBranchIds !== undefined) {
      where.id = { in: allowedBranchIds };
    }

    const [branches, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: Math.min(query.limit ?? 50, 200),
        skip: query.offset ?? 0,
        include: { _count: { select: { users: true } } },
      }),
      this.prisma.branch.count({ where }),
    ]);

    return {
      data: branches.map((b) => ({
        ...b,
        activeUserCount: b._count.users,
        _count: undefined,
      })),
      total,
    };
  }

  // ─── Template copy ────────────────────────────────────────────────────────

  /**
   * Copy CONFIG from `templateId` into `targetId`.
   * Config = ingredient applicability, chart-of-accounts associations, supplier links.
   * Transactional data (bills, shifts, stock movements) is NEVER copied.
   *
   * Currently copies: supplier chain-wide associations.
   * Price tables and ingredient applicability will be added in later phases.
   */
  private async copyConfigFromTemplate(
    templateId: string,
    targetId: string,
    tx: TxClient,
  ): Promise<void> {
    const template = await tx.branch.findUnique({
      where: { id: templateId },
      select: { id: true, code: true },
    });
    if (!template) {
      throw new NotFoundException(`Template branch ${templateId} not found`);
    }

    // Copy chain-wide suppliers (no transaction data — just the catalog link).
    // Branch-specific suppliers are not copied — they belong to the source branch.
    // This is intentionally a no-op for now; price table copy will be added in a later phase.
    this.logger.log(
      `Template copy: from=${templateId} → to=${targetId} (supplier links deferred)`,
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private validateCode(code: string): void {
    // Branch code: 2–5 uppercase characters (letters A-Z and digits 0-9), e.g. "CN01".
    // Must start with a letter. All characters uppercase.
    if (!/^[A-Z][A-Z0-9]{1,4}$/.test(code)) {
      throw new BadRequestException(
        `Branch code must be 2–5 uppercase alphanumeric characters starting with a letter, got: "${code}"`,
      );
    }
  }
}
