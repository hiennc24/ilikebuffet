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
import { Role } from "../rbac/role.enum";
import type { ScopedRequest } from "../rbac/branch-scope.guard";
import { CreateUserDto, UpdateUserDto, UserListQuery } from "./users.dto";

const USER_ADMIN_ROLES = new Set<Role>([Role.QUAN_TRI_HQ, Role.QUAN_LY_CN]);

@Controller("users")
export class UsersController {
  constructor(private readonly service: UsersService) {}

  private access(req: ScopedRequest) {
    if (!USER_ADMIN_ROLES.has(req.user.role as Role)) {
      throw new ForbiddenException("Không có quyền quản lý người dùng");
    }
    return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
  }

  @Get()
  list(@Query() query: UserListQuery, @Request() req: ScopedRequest) {
    return this.service.list(query, req.user.role, this.access(req));
  }

  @Post()
  create(@Body() dto: CreateUserDto, @Request() req: ScopedRequest) {
    return this.service.create(dto, req.user.sub, req.user.role, this.access(req));
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto, @Request() req: ScopedRequest) {
    return this.service.update(id, dto, req.user.sub, req.user.role, this.access(req));
  }

  @Post(":id/reset-password")
  resetPassword(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.resetPassword(id, req.user.sub, req.user.role, this.access(req));
  }

  @Post(":id/reset-approval-pin")
  resetApprovalPin(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.resetPin(id, "approval", req.user.sub, req.user.role, this.access(req));
  }

  @Post(":id/reset-cashier-pin")
  resetCashierPin(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.resetPin(id, "cashier", req.user.sub, req.user.role, this.access(req));
  }

  @Post(":id/lock")
  lock(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.setLocked(id, true, req.user.sub, req.user.role, this.access(req));
  }

  @Post(":id/unlock")
  unlock(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.setLocked(id, false, req.user.sub, req.user.role, this.access(req));
  }
}
