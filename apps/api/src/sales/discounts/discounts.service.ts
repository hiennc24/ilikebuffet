/**
 * DiscountsService — VG-03 discount programs, vouchers, approval PIN.
 *
 * Invariants:
 *   - Max 1 discount program per bill (MVP — no stacking, VG-03.2).
 *   - Voucher quota: decremented with SELECT … FOR UPDATE row lock so two
 *     concurrent redemptions of the last unit cannot both succeed (VG-03.4).
 *     Uses PrismaService.$queryRaw FOR UPDATE (same pattern as lockRowForUpdate
 *     in prisma.service.ts for bill numbering).
 *   - Approval PIN: argon2.verify against approvalPinHash on AppUser.
 *     3 wrong attempts → cancel operation + audit log (VG-03.3).
 *     Only QUAN_LY_CN users have approvalPinHash set (M1 from auth phase).
 *   - All sensitive mutations (PIN verify, quota decrement) audited in-tx.
 *   - HQ creates/edits programs; QL_CN reads programs for their branch (VG-03.6).
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { DiscountKind, DiscountProgramStatus, Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { assertVndInteger } from "@ilikebuffet/shared";
import type {
  CreateDiscountProgramDto,
  UpdateDiscountProgramDto,
  DiscountProgramListQuery,
  CreateDiscountReasonDto,
  RedeemVoucherDto,
  VerifyApprovalPinDto,
  VerifyApprovalPinResult,
} from "./discounts.dto";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max wrong PIN attempts before the manual-discount operation is cancelled (VG-03.3). */
const MAX_PIN_ATTEMPTS = 3;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class DiscountsService {
  private readonly logger = new Logger(DiscountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Discount Programs ────────────────────────────────────────────────────

  async createProgram(
    dto: CreateDiscountProgramDto,
    actorId?: string,
    actorRole?: string,
  ) {
    this.validateProgramDto(dto);

    return this.prisma.withTx(async (tx) => {
      const program = await tx.discountProgram.create({
        data: {
          name: dto.name,
          kind: dto.kind as DiscountKind,
          pct: dto.pct ?? null,
          amountVnd: dto.amountVnd ?? null,
          voucherCode: dto.voucherCode ? dto.voucherCode.toUpperCase() : null,
          quotaTotal: dto.quotaTotal ?? null,
          quotaRemaining: dto.quotaTotal ?? null, // starts equal to total
          validFrom: dto.validFrom ? new Date(`${dto.validFrom}T00:00:00.000Z`) : null,
          validUntil: dto.validUntil ? new Date(`${dto.validUntil}T00:00:00.000Z`) : null,
          branchScope: dto.branchScope ? (dto.branchScope as Prisma.InputJsonValue) : Prisma.DbNull,
          status: DiscountProgramStatus.ACTIVE,
        },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "discount_program.create",
        objectType: "discount_program",
        objectId: program.id,
        after: { name: program.name, kind: program.kind, quotaTotal: program.quotaTotal },
      });

      this.logger.log(`DiscountProgram created: id=${program.id} kind=${program.kind}`);
      return program;
    });
  }

  async updateProgram(
    id: string,
    dto: UpdateDiscountProgramDto,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const existing = await tx.discountProgram.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`DiscountProgram ${id} not found`);

      const updated = await tx.discountProgram.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.validFrom !== undefined && {
            validFrom: dto.validFrom ? new Date(`${dto.validFrom}T00:00:00.000Z`) : null,
          }),
          ...(dto.validUntil !== undefined && {
            validUntil: dto.validUntil ? new Date(`${dto.validUntil}T00:00:00.000Z`) : null,
          }),
          ...(dto.branchScope !== undefined && {
            branchScope: dto.branchScope ? (dto.branchScope as Prisma.InputJsonValue) : Prisma.DbNull,
          }),
        },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "discount_program.update",
        objectType: "discount_program",
        objectId: id,
        before: { name: existing.name },
        after: { name: updated.name },
      });

      return updated;
    });
  }

  async deactivateProgram(id: string, actorId?: string, actorRole?: string) {
    return this.prisma.withTx(async (tx) => {
      const existing = await tx.discountProgram.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`DiscountProgram ${id} not found`);

      const updated = await tx.discountProgram.update({
        where: { id },
        data: { status: DiscountProgramStatus.INACTIVE },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "discount_program.deactivate",
        objectType: "discount_program",
        objectId: id,
        before: { status: existing.status },
        after: { status: DiscountProgramStatus.INACTIVE },
      });

      return updated;
    });
  }

  async listPrograms(query: DiscountProgramListQuery) {
    const where: Prisma.DiscountProgramWhereInput = {};
    if (query.kind) where.kind = query.kind as DiscountKind;
    if (query.activeOnly !== false) where.status = DiscountProgramStatus.ACTIVE;

    // Branch scope filter: program applies if branchScope is null (all) or contains branchId.
    // For MVP we filter in-app after fetching; a future index-backed JSON query can replace this.
    const programs = await this.prisma.discountProgram.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    if (!query.branchId) return programs;

    return programs.filter((p) => {
      if (!p.branchScope) return true; // null = all branches
      const scope = p.branchScope as string[];
      return Array.isArray(scope) && scope.includes(query.branchId!);
    });
  }

  async findOneProgram(id: string) {
    const p = await this.prisma.discountProgram.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`DiscountProgram ${id} not found`);
    return p;
  }

  // ─── Voucher redemption (VG-03.4) ────────────────────────────────────────

  /**
   * Redeem a voucher code for a branch.
   *
   * Uses SELECT … FOR UPDATE to lock the discount_program row, ensuring two
   * concurrent redemptions of the last quota unit cannot both succeed (VG-03.4).
   *
   * Lock pattern: same as bill-numbering counter in prisma.service.ts.
   */
  async redeemVoucher(
    dto: RedeemVoucherDto,
    actorId?: string,
    actorRole?: string,
  ) {
    const upperCode = dto.voucherCode.toUpperCase();

    return this.prisma.withTx(
      async (tx) => {
        // Lock the voucher row FOR UPDATE to prevent concurrent over-redemption.
        const rows = await tx.$queryRaw<Array<{
          id: string;
          quota_remaining: number | null;
          valid_from: Date | null;
          valid_until: Date | null;
          status: string;
          branch_scope: unknown;
        }>>`
          SELECT id, "quotaRemaining" AS quota_remaining,
                 "validFrom" AS valid_from, "validUntil" AS valid_until,
                 status, "branchScope" AS branch_scope
          FROM discount_program
          WHERE UPPER("voucherCode") = ${upperCode}
          FOR UPDATE
        `;

        if (rows.length === 0) {
          throw new BadRequestException(`Voucher code "${dto.voucherCode}" not found`);
        }

        const row = rows[0]!;

        if (row.status !== "ACTIVE") {
          throw new BadRequestException(`Voucher "${dto.voucherCode}" is inactive`);
        }

        const now = new Date();
        if (row.valid_from && row.valid_from > now) {
          throw new BadRequestException(`Voucher "${dto.voucherCode}" is not yet valid`);
        }
        if (row.valid_until && row.valid_until < now) {
          throw new BadRequestException(`Voucher "${dto.voucherCode}" has expired`);
        }

        // Branch scope check.
        if (row.branch_scope !== null && row.branch_scope !== undefined) {
          const scope = row.branch_scope as string[];
          if (Array.isArray(scope) && !scope.includes(dto.branchId)) {
            throw new BadRequestException(
              `Voucher "${dto.voucherCode}" is not valid for this branch`,
            );
          }
        }

        // Quota check — only if quota is set.
        if (row.quota_remaining !== null) {
          if (row.quota_remaining <= 0) {
            throw new BadRequestException(
              `Voucher "${dto.voucherCode}" has no remaining uses (hết lượt)`,
            );
          }
          // Decrement quota atomically (row is locked).
          await tx.discountProgram.update({
            where: { id: row.id },
            data: { quotaRemaining: { decrement: 1 } },
          });
        }

        await this.audit.record(tx, {
          actorId,
          actorRole,
          action: "voucher.redeemed",
          objectType: "discount_program",
          objectId: row.id,
          branchId: dto.branchId,
          after: { voucherCode: upperCode, branchId: dto.branchId },
        });

        return this.prisma.discountProgram.findUnique({ where: { id: row.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  // ─── Approval PIN verification (VG-03.3) ─────────────────────────────────

  /**
   * Verify a QUAN_LY_CN approval PIN for a manual discount over threshold.
   *
   * Security model:
   *   - approvalPinHash is set only for QUAN_LY_CN users (enforced by AuthService.setApprovalPin).
   *   - 3 consecutive wrong PINs → operation cancelled + audit log (VG-03.3).
   *   - Uses argon2.verify (same library as password verification in AuthService).
   *   - PIN failure counter uses Prisma { increment: 1 } — same atomic pattern as
   *     AuthService.handleLoginFailureAtomic (Red Team H3).
   *   - We track failures in pinFailedCount on AppUser (shared with cashier-PIN lock).
   *     Approval-PIN and cashier-PIN are distinct fields (approvalPinHash vs cashierPinHash)
   *     but share the same failure counter for simplicity in MVP.
   */
  async verifyApprovalPin(
    dto: VerifyApprovalPinDto,
    actorId?: string,
    actorRole?: string,
    // When a caller runs the approved operation in its own transaction, it can
    // pass that tx so the success reset + "verified" audit commit atomically with
    // the operation. The wrong-PIN failure counter/lock always commits on the
    // base client — it must survive even if the caller later rolls back.
    successTx?: Prisma.TransactionClient,
  ): Promise<VerifyApprovalPinResult> {
    const manager = await this.prisma.appUser.findUnique({
      where: { id: dto.managerId },
      include: { branches: true },
    });

    if (!manager) {
      throw new NotFoundException(`User ${dto.managerId} not found`);
    }

    if (manager.role !== "QUAN_LY_CN") {
      throw new ForbiddenException("Approval PIN can only be verified for QUAN_LY_CN users");
    }

    // The manager must belong to the branch the operation targets, so a manager
    // from another branch cannot approve a cancel/force-close here (Red Team).
    if (dto.branchId && !manager.branches.some((b) => b.branchId === dto.branchId)) {
      await this.audit.record(this.prisma, {
        actorId,
        actorRole,
        action: "approval_pin.branch_mismatch",
        objectType: "app_user",
        objectId: dto.managerId,
        branchId: dto.branchId,
        reason: dto.reason,
      });
      throw new ForbiddenException("Quản lý không thuộc chi nhánh của thao tác này");
    }

    if (!manager.approvalPinHash) {
      throw new BadRequestException(
        "This manager has not set an approval PIN. Ask them to set it first.",
      );
    }

    // Check if PIN is locked (reuse password-lock mechanism).
    if (manager.pinLockedUntil && manager.pinLockedUntil > new Date()) {
      await this.audit.record(this.prisma, {
        actorId,
        actorRole,
        action: "approval_pin.locked_attempt",
        objectType: "app_user",
        objectId: dto.managerId,
        branchId: dto.branchId,
        reason: dto.reason,
      });
      throw new UnauthorizedException("Manager PIN is locked. Try again later.");
    }

    const valid = await argon2.verify(manager.approvalPinHash, dto.pin);

    if (valid) {
      // Success writes ride the caller's tx when provided, so the approval and
      // the operation it authorises commit (or roll back) together.
      const writer = successTx ?? this.prisma;
      // Reset failure count on success.
      await writer.appUser.update({
        where: { id: dto.managerId },
        data: { pinFailedCount: 0, pinLockedUntil: null },
      });

      await this.audit.record(writer, {
        actorId,
        actorRole,
        action: "approval_pin.verified",
        objectType: "app_user",
        objectId: dto.managerId,
        branchId: dto.branchId,
        approvedBy: dto.managerId,
        reason: dto.reason,
      });

      this.logger.log(`Approval PIN verified: managerId=${dto.managerId}`);
      return { approved: true, approvedBy: dto.managerId };
    }

    // Wrong PIN — increment failure counter atomically (H3 pattern).
    const updated = await this.prisma.appUser.update({
      where: { id: dto.managerId },
      data: { pinFailedCount: { increment: 1 } },
    });

    const attempts = updated.pinFailedCount;

    await this.audit.record(this.prisma, {
      actorId,
      actorRole,
      action: "approval_pin.wrong",
      objectType: "app_user",
      objectId: dto.managerId,
      branchId: dto.branchId,
      reason: `Wrong PIN attempt ${attempts}/${MAX_PIN_ATTEMPTS}. ${dto.reason ?? ""}`.trim(),
    });

    if (attempts >= MAX_PIN_ATTEMPTS) {
      // 3 wrong → cancel operation and lock.
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      await this.prisma.appUser.update({
        where: { id: dto.managerId },
        data: { pinLockedUntil: lockUntil },
      });

      await this.audit.record(this.prisma, {
        actorId,
        actorRole,
        action: "approval_pin.cancelled",
        objectType: "app_user",
        objectId: dto.managerId,
        branchId: dto.branchId,
        reason: `PIN locked after ${MAX_PIN_ATTEMPTS} failed attempts. Operation cancelled.`,
      });

      this.logger.warn(
        `Approval PIN locked: managerId=${dto.managerId} after ${attempts} failed attempts`,
      );
      return { approved: false, locked: true };
    }

    return { approved: false };
  }

  // ─── Discount reasons ─────────────────────────────────────────────────────

  async createReason(
    dto: CreateDiscountReasonDto,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const reason = await tx.discountReason.create({
        data: { name: dto.name },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "discount_reason.create",
        objectType: "discount_reason",
        objectId: reason.id,
        after: { name: reason.name },
      });

      return reason;
    });
  }

  async listReasons(activeOnly = true) {
    return this.prisma.discountReason.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { name: "asc" },
    });
  }

  // ─── Private validation ───────────────────────────────────────────────────

  private validateProgramDto(dto: CreateDiscountProgramDto): void {
    if (dto.kind === "PERCENT") {
      if (dto.pct === undefined || dto.pct === null) {
        throw new BadRequestException("pct is required for PERCENT discount");
      }
      if (!Number.isInteger(dto.pct) || dto.pct < 0 || dto.pct > 100) {
        throw new BadRequestException("pct must be an integer 0–100");
      }
    }

    if (dto.kind === "FIXED_AMOUNT") {
      if (dto.amountVnd === undefined || dto.amountVnd === null) {
        throw new BadRequestException("amountVnd is required for FIXED_AMOUNT discount");
      }
      assertVndInteger(dto.amountVnd);
      if (dto.amountVnd < 0) {
        throw new BadRequestException("amountVnd must be >= 0");
      }
    }

    if (dto.kind === "VOUCHER") {
      if (!dto.voucherCode || dto.voucherCode.trim() === "") {
        throw new BadRequestException("voucherCode is required for VOUCHER discount");
      }
    }

    if (dto.quotaTotal !== undefined && dto.quotaTotal !== null) {
      if (!Number.isInteger(dto.quotaTotal) || dto.quotaTotal < 1) {
        throw new BadRequestException("quotaTotal must be a positive integer");
      }
    }
  }
}
