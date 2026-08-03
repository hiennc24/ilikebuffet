/**
 * RoleService — CRUD for DB-backed roles (RBAC-01). Capabilities are validated
 * against the fixed code catalog (ALL_CAPABILITIES). Safety nets: a role still
 * assigned to users can't be deleted, and the last role holding chain:user:manage
 * can't lose it (delete or capability edit) — otherwise no one could manage roles.
 * Every write invalidates the permission cache so edits take effect immediately.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { PermissionService } from "./permission.service";
import { ALL_CAPABILITIES } from "./capability-catalog";
import type { CreateRoleDto, UpdateRoleDto } from "./role.dto";

const ADMIN_CAP = "chain:user:manage";

@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perms: PermissionService,
  ) {}

  /** All roles with their capabilities and how many users hold each. */
  async listRoles() {
    const [roles, counts] = await Promise.all([
      this.prisma.role.findMany({ include: { capabilities: { select: { capability: true } } }, orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
      this.prisma.appUser.groupBy({ by: ["role"], _count: { _all: true } }),
    ]);
    const countByCode = new Map(counts.map((c) => [c.role, c._count._all]));
    return roles.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      capabilities: r.capabilities.map((c) => c.capability),
      userCount: countByCode.get(r.code) ?? 0,
    }));
  }

  /** Reject any capability outside the code catalog. */
  private assertKnownCapabilities(capabilities: string[]): void {
    const unknown = capabilities.filter((c) => !ALL_CAPABILITIES.includes(c as (typeof ALL_CAPABILITIES)[number]));
    if (unknown.length) throw new BadRequestException(`Quyền không hợp lệ: ${unknown.join(", ")}`);
  }

  /** Count roles (other than `exceptCode`) that still hold the admin capability. */
  private async otherAdminRoleCount(exceptCode: string): Promise<number> {
    return this.prisma.role.count({ where: { code: { not: exceptCode }, capabilities: { some: { capability: ADMIN_CAP } } } });
  }

  async createRole(dto: CreateRoleDto, actorId: string, actorRole: string) {
    this.assertKnownCapabilities(dto.capabilities);
    const existing = await this.prisma.role.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Mã vai trò đã tồn tại: ${dto.code}`);
    const caps = [...new Set(dto.capabilities)];

    const role = await this.prisma.role.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        isSystem: false,
        capabilities: { create: caps.map((capability) => ({ capability })) },
      },
      include: { capabilities: { select: { capability: true } } },
    });
    await this.audit.record(this.prisma, {
      actorId, actorRole, action: "role.create", objectType: "role", objectId: dto.code,
      after: { name: dto.name, capabilities: caps },
    });
    return { code: role.code, name: role.name, description: role.description, isSystem: role.isSystem, capabilities: caps };
  }

  async updateRole(code: string, dto: UpdateRoleDto, actorId: string, actorRole: string) {
    const role = await this.prisma.role.findUnique({ where: { code } });
    if (!role) throw new NotFoundException(`Không tìm thấy vai trò: ${code}`);
    const updated = await this.prisma.role.update({
      where: { code },
      data: { name: dto.name ?? undefined, description: dto.description ?? undefined },
    });
    await this.audit.record(this.prisma, {
      actorId, actorRole, action: "role.update", objectType: "role", objectId: code,
      before: { name: role.name }, after: { name: updated.name },
    });
    return { code: updated.code, name: updated.name, description: updated.description, isSystem: updated.isSystem };
  }

  async setCapabilities(code: string, capabilities: string[], actorId: string, actorRole: string) {
    this.assertKnownCapabilities(capabilities);
    const role = await this.prisma.role.findUnique({ where: { code }, include: { capabilities: { select: { capability: true } } } });
    if (!role) throw new NotFoundException(`Không tìm thấy vai trò: ${code}`);
    const caps = [...new Set(capabilities)];

    // Safety: don't strip the last role that can manage roles/users.
    const hadAdmin = role.capabilities.some((c) => c.capability === ADMIN_CAP);
    if (hadAdmin && !caps.includes(ADMIN_CAP) && (await this.otherAdminRoleCount(code)) === 0) {
      throw new ConflictException("Không thể bỏ quyền quản lý người dùng của vai trò cuối cùng còn quyền này");
    }

    await this.prisma.withTx(async (tx) => {
      await tx.roleCapability.deleteMany({ where: { roleId: role.id } });
      if (caps.length) await tx.roleCapability.createMany({ data: caps.map((capability) => ({ roleId: role.id, capability })) });
      await this.audit.record(tx, {
        actorId, actorRole, action: "role.set-capabilities", objectType: "role", objectId: code,
        before: { capabilities: role.capabilities.map((c) => c.capability) }, after: { capabilities: caps },
      });
    });
    this.perms.invalidate(code);
    return { code, capabilities: caps };
  }

  async deleteRole(code: string, actorId: string, actorRole: string) {
    const role = await this.prisma.role.findUnique({ where: { code }, include: { capabilities: { select: { capability: true } } } });
    if (!role) throw new NotFoundException(`Không tìm thấy vai trò: ${code}`);

    const userCount = await this.prisma.appUser.count({ where: { role: code } });
    if (userCount > 0) throw new ConflictException(`Vai trò còn ${userCount} người dùng — không thể xoá`);

    const hasAdmin = role.capabilities.some((c) => c.capability === ADMIN_CAP);
    if (hasAdmin && (await this.otherAdminRoleCount(code)) === 0) {
      throw new ConflictException("Không thể xoá vai trò cuối cùng còn quyền quản lý người dùng");
    }

    await this.prisma.role.delete({ where: { code } });
    await this.audit.record(this.prisma, { actorId, actorRole, action: "role.delete", objectType: "role", objectId: code, before: { name: role.name } });
    this.perms.invalidate(code);
    return { code, deleted: true };
  }
}
