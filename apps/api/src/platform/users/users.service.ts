/**
 * UsersService — user administration (list, create, update, reset, lock).
 *
 * Security invariants:
 *   - Responses never include password/PIN hashes (SAFE_SELECT only).
 *   - Insider-resistant: a QUAN_LY_CN may only manage cashier/warehouse roles
 *     within their own branch(es); only QUAN_TRI_HQ manages managers/HQ/owners or
 *     chain-wide users. No actor can mint a role they aren't allowed to manage.
 *   - New users get a system-generated one-time password + mustChangePassword.
 *   - Lock bumps tokenVersion so existing sessions are revoked (≤30s).
 *   - Every mutation is audited (GA-01).
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { Role, CHAIN_WIDE_ROLES } from "../rbac/role.enum";
import { assertBranchAccess, type BranchAccess } from "../rbac/branch-access";
import type { CreateUserDto, UpdateUserDto, UserListQuery } from "./users.dto";

/** Columns safe to return — never hashes/PIN material. */
const SAFE_SELECT = {
  id: true,
  username: true,
  role: true,
  chainWide: true,
  mustChangePassword: true,
  lockedUntil: true,
  createdAt: true,
  branches: { select: { branchId: true } },
} satisfies Prisma.AppUserSelect;

/** Roles a QUAN_LY_CN may manage (never a peer/manager or chain-wide role). */
const BRANCH_MANAGEABLE_ROLES = new Set<Role>([Role.THU_NGAN, Role.THU_KHO]);

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Whether an actor role may create/modify a target role at all. */
  private canManageRole(actorRole: string, targetRole: Role): boolean {
    if (actorRole === Role.QUAN_TRI_HQ) return true;
    if (actorRole === Role.QUAN_LY_CN) return BRANCH_MANAGEABLE_ROLES.has(targetRole);
    return false;
  }

  private assertCanManageRole(actorRole: string, targetRole: Role): void {
    if (!this.canManageRole(actorRole, targetRole)) {
      throw new ForbiddenException("Không có quyền quản lý vai trò này");
    }
  }

  /** Load a user for management, enforcing branch scope + role authority. */
  private async loadManageableUser(id: string, actorRole: string, access: BranchAccess) {
    const user = await this.prisma.appUser.findUnique({
      where: { id },
      select: { ...SAFE_SELECT },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    this.assertCanManageRole(actorRole, user.role as Role);
    // Non-chain-wide actor: the target must be a member of one of the actor's branches.
    if (!access.chainWide) {
      const targetBranchIds = user.branches.map((b) => b.branchId);
      const overlaps = targetBranchIds.some((b) => access.branchIds.includes(b));
      if (!overlaps) throw new ForbiddenException("Người dùng ngoài phạm vi chi nhánh");
    }
    return user;
  }

  async list(query: UserListQuery, actorRole: string, access: BranchAccess) {
    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize ?? "20", 10) || 20));

    const now = new Date();
    const where: Prisma.AppUserWhereInput = {
      ...(query.role ? { role: query.role as Role } : {}),
      ...(query.search ? { username: { contains: query.search, mode: "insensitive" } } : {}),
      ...(query.status === "locked" ? { lockedUntil: { gt: now } } : {}),
      ...(query.status === "active" ? { OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] } : {}),
      // Branch scope: a non-chain-wide actor only sees users in their branch(es).
      ...(access.chainWide
        ? query.branchId
          ? { branches: { some: { branchId: query.branchId } } }
          : {}
        : { branches: { some: { branchId: { in: access.branchIds } } } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.appUser.findMany({
        where,
        select: SAFE_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.appUser.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async create(dto: CreateUserDto, actorId: string, actorRole: string, access: BranchAccess) {
    const role = dto.role as Role;
    this.assertCanManageRole(actorRole, role);

    const chainWide = CHAIN_WIDE_ROLES.has(role);
    const branchIds = chainWide ? [] : dto.branchIds ?? [];
    if (!chainWide && branchIds.length === 0) {
      throw new BadRequestException("Vai trò theo chi nhánh phải có ít nhất 1 chi nhánh");
    }
    // A non-chain-wide actor may only assign branches they belong to.
    if (!access.chainWide) {
      for (const b of branchIds) assertBranchAccess(access, b);
    }

    const existing = await this.prisma.appUser.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException("Tên đăng nhập đã tồn tại");

    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword);

    const user = await this.prisma.withTx(async (tx) => {
      const created = await tx.appUser.create({
        data: {
          username: dto.username,
          passwordHash,
          role,
          chainWide,
          mustChangePassword: true,
          branches: chainWide ? undefined : { create: branchIds.map((branchId) => ({ branchId })) },
        },
        select: SAFE_SELECT,
      });
      await this.audit.record(tx, {
        action: "user.create",
        objectType: "app_user",
        objectId: created.id,
        actorId,
        actorRole,
        after: { username: created.username, role: created.role, branchIds },
      });
      return created;
    });

    this.logger.log(`User created: ${user.username} role=${user.role} by=${actorId}`);
    // The temp password is returned exactly once; it is never stored in plaintext.
    return { user, tempPassword };
  }

  async update(id: string, dto: UpdateUserDto, actorId: string, actorRole: string, access: BranchAccess) {
    const target = await this.loadManageableUser(id, actorRole, access);

    const nextRole = (dto.role as Role) ?? (target.role as Role);
    this.assertCanManageRole(actorRole, nextRole); // can't promote into a role you can't manage
    const chainWide = CHAIN_WIDE_ROLES.has(nextRole);
    const branchIds = chainWide ? [] : dto.branchIds ?? target.branches.map((b) => b.branchId);
    if (!chainWide && branchIds.length === 0) {
      throw new BadRequestException("Vai trò theo chi nhánh phải có ít nhất 1 chi nhánh");
    }
    if (!access.chainWide) {
      for (const b of branchIds) assertBranchAccess(access, b);
    }

    const updated = await this.prisma.withTx(async (tx) => {
      // Replace branch memberships wholesale.
      await tx.userBranch.deleteMany({ where: { userId: id } });
      const u = await tx.appUser.update({
        where: { id },
        data: {
          role: nextRole,
          chainWide,
          branches: chainWide ? undefined : { create: branchIds.map((branchId) => ({ branchId })) },
        },
        select: SAFE_SELECT,
      });
      await this.audit.record(tx, {
        action: "user.update",
        objectType: "app_user",
        objectId: id,
        actorId,
        actorRole,
        before: { role: target.role, branchIds: target.branches.map((b) => b.branchId) },
        after: { role: u.role, branchIds },
      });
      return u;
    });
    return updated;
  }

  async resetPassword(id: string, actorId: string, actorRole: string, access: BranchAccess) {
    await this.loadManageableUser(id, actorRole, access);
    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword);
    await this.prisma.withTx(async (tx) => {
      await tx.appUser.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } },
      });
      await this.audit.record(tx, {
        action: "user.reset_password",
        objectType: "app_user",
        objectId: id,
        actorId,
        actorRole,
      });
    });
    return { tempPassword };
  }

  async resetPin(id: string, kind: "approval" | "cashier", actorId: string, actorRole: string, access: BranchAccess) {
    await this.loadManageableUser(id, actorRole, access);
    const data = kind === "approval" ? { approvalPinHash: null } : { cashierPinHash: null };
    await this.prisma.withTx(async (tx) => {
      await tx.appUser.update({ where: { id }, data: { ...data, pinFailedCount: 0, pinLockedUntil: null } });
      await this.audit.record(tx, {
        action: `user.reset_${kind}_pin`,
        objectType: "app_user",
        objectId: id,
        actorId,
        actorRole,
      });
    });
    return { ok: true };
  }

  async setLocked(id: string, locked: boolean, actorId: string, actorRole: string, access: BranchAccess) {
    await this.loadManageableUser(id, actorRole, access);
    await this.prisma.withTx(async (tx) => {
      await tx.appUser.update({
        where: { id },
        data: locked
          ? { lockedUntil: new Date("2999-12-31T00:00:00Z"), tokenVersion: { increment: 1 } }
          : { lockedUntil: null, failedLoginCount: 0 },
      });
      await this.audit.record(tx, {
        action: locked ? "user.lock" : "user.unlock",
        objectType: "app_user",
        objectId: id,
        actorId,
        actorRole,
      });
    });
    return { ok: true };
  }
}

/** A readable one-time temp password: 12 url-safe chars. Never stored plaintext. */
function generateTempPassword(): string {
  return randomBytes(9).toString("base64url").slice(0, 12);
}
