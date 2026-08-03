/**
 * RbacController — role & permission management for the admin "Vai trò & phân quyền"
 * screen. GET /rbac/capabilities returns the capability catalog (groups + VN labels);
 * /rbac/roles is full CRUD over DB-backed roles. All routes require the
 * chain:user:manage capability (the same permission that manages users). Capabilities
 * themselves are code-enforced (fixed catalog); only roles are data.
 */
import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Request } from "@nestjs/common";
import { PermissionService } from "./permission.service";
import { RoleService } from "./role.service";
import { CAPABILITY_CATALOG } from "./capability-catalog";
import { CreateRoleDto, UpdateRoleDto, SetCapabilitiesDto } from "./role.dto";
import type { ScopedRequest } from "./branch-scope.guard";

@Controller("rbac")
export class RbacController {
  constructor(
    private readonly perms: PermissionService,
    private readonly roles: RoleService,
  ) {}

  private async require(req: ScopedRequest) {
    if (!(await this.perms.can(req.user.role, "chain:user:manage"))) {
      throw new ForbiddenException("Không có quyền quản lý vai trò & phân quyền");
    }
  }

  /** The permission catalog: feature groups with Vietnamese labels + actions. */
  @Get("capabilities")
  async capabilities(@Request() req: ScopedRequest) {
    await this.require(req);
    return { groups: CAPABILITY_CATALOG };
  }

  @Get("roles")
  async list(@Request() req: ScopedRequest) {
    await this.require(req);
    return { data: await this.roles.listRoles() };
  }

  @Post("roles")
  async create(@Body() dto: CreateRoleDto, @Request() req: ScopedRequest) {
    await this.require(req);
    return this.roles.createRole(dto, req.user.sub, req.user.role);
  }

  @Put("roles/:code")
  async update(@Param("code") code: string, @Body() dto: UpdateRoleDto, @Request() req: ScopedRequest) {
    await this.require(req);
    return this.roles.updateRole(code, dto, req.user.sub, req.user.role);
  }

  @Put("roles/:code/capabilities")
  async setCapabilities(@Param("code") code: string, @Body() dto: SetCapabilitiesDto, @Request() req: ScopedRequest) {
    await this.require(req);
    return this.roles.setCapabilities(code, dto.capabilities, req.user.sub, req.user.role);
  }

  @Delete("roles/:code")
  async remove(@Param("code") code: string, @Request() req: ScopedRequest) {
    await this.require(req);
    return this.roles.deleteRole(code, req.user.sub, req.user.role);
  }
}
