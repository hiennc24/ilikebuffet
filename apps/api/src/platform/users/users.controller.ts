/**
 * UsersController — user administration.
 *
 * Only QUAN_TRI_HQ and QUAN_LY_CN reach these routes; the service enforces the
 * finer insider-resistant rules (branch scope, which roles each may manage) and
 * never returns hashes. Routes carry no branchId, so the global scope guard
 * passes keyless and the service does the branch check via BranchAccess.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { PermissionService } from "../rbac/permission.service";
import type { ScopedRequest } from "../rbac/branch-scope.guard";
import { CreateUserDto, UpdateUserDto, UserListQuery } from "./users.dto";

@Controller("users")
export class UsersController {
  constructor(
    private readonly service: UsersService,
    private readonly perms: PermissionService,
  ) {}

  private async access(req: ScopedRequest) {
    if (!(await this.perms.can(req.user.role, "chain:user:manage"))) {
      throw new ForbiddenException("Không có quyền quản lý người dùng");
    }
    return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
  }

  @Get()
  async list(@Query() query: UserListQuery, @Request() req: ScopedRequest) {
    return this.service.list(query, req.user.role, await this.access(req));
  }

  @Post()
  async create(@Body() dto: CreateUserDto, @Request() req: ScopedRequest) {
    return this.service.create(dto, req.user.sub, req.user.role, await this.access(req));
  }

  @Put(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateUserDto, @Request() req: ScopedRequest) {
    return this.service.update(id, dto, req.user.sub, req.user.role, await this.access(req));
  }

  @Post(":id/reset-password")
  async resetPassword(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.resetPassword(id, req.user.sub, req.user.role, await this.access(req));
  }

  @Post(":id/reset-approval-pin")
  async resetApprovalPin(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.resetPin(id, "approval", req.user.sub, req.user.role, await this.access(req));
  }

  @Post(":id/reset-cashier-pin")
  async resetCashierPin(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.resetPin(id, "cashier", req.user.sub, req.user.role, await this.access(req));
  }

  @Post(":id/lock")
  async lock(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.setLocked(id, true, req.user.sub, req.user.role, await this.access(req));
  }

  @Post(":id/unlock")
  async unlock(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.setLocked(id, false, req.user.sub, req.user.role, await this.access(req));
  }
}
