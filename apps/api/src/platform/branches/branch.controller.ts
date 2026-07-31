/**
 * BranchController — CRUD + status management (NT-01).
 *
 * Role gates:
 *   - Mutations (create, update, status-change): QUAN_TRI_HQ only.
 *   - Reads: all authenticated users (scoped by BranchScopeGuard).
 *
 * @Unscoped() on the list route: HQ list all branches.
 * Individual branch reads use :branchId — BranchScopeGuard enforces membership.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
} from "@nestjs/common";
import { BranchService } from "./branch.service";
import { Unscoped } from "../rbac/decorators";
import { Role } from "../rbac/role.enum";
import type { ScopedRequest } from "../rbac/branch-scope.guard";
import type {
  ChangeBranchStatusDto,
  BranchListQuery,
  CreateBranchDto,
  UpdateBranchDto,
} from "./branch.dto";

@Controller("branches")
export class BranchController {
  constructor(private readonly service: BranchService) {}

  /**
   * List branches.
   * H3 fix: chain-wide roles see all; non-chainWide users see only their branches.
   * bankAccount is never returned to non-members (VietQR data — branch-confidential).
   */
  @Unscoped()
  @Get()
  list(@Query() query: BranchListQuery, @Request() req: ScopedRequest) {
    const isMember = req.user.chainWide === true;
    return this.service.list(query, isMember ? undefined : req.user.branchIds);
  }

  /**
   * Get one branch. BranchScopeGuard enforces membership via :branchId param.
   * H3 fix: strip bankAccount for non-members.
   */
  @Get(":branchId")
  async findOne(@Param("branchId") branchId: string, @Request() req: ScopedRequest) {
    const branch = await this.service.findOne(branchId);
    // Only branch members and chain-wide roles see bankAccount (VietQR data).
    if (!req.user.chainWide && !req.user.branchIds.includes(branchId)) {
      const { bankAccount: _omit, ...rest } = branch as Record<string, unknown>;
      return rest;
    }
    return branch;
  }

  /** Create a branch. QUAN_TRI_HQ only. */
  @Unscoped()
  @Post()
  create(@Body() dto: CreateBranchDto, @Request() req: ScopedRequest) {
    this.requireHq(req);
    return this.service.create(dto, req.user.sub, req.user.role);
  }

  /** Update a branch. QUAN_TRI_HQ only. */
  @Put(":branchId")
  update(
    @Param("branchId") branchId: string,
    @Body() dto: UpdateBranchDto,
    @Request() req: ScopedRequest,
  ) {
    this.requireHq(req);
    return this.service.update(branchId, dto, req.user.sub, req.user.role);
  }

  /** Change branch status (ACTIVE/SUSPENDED/CLOSED). QUAN_TRI_HQ only. */
  @Patch(":branchId/status")
  changeStatus(
    @Param("branchId") branchId: string,
    @Body() dto: ChangeBranchStatusDto,
    @Request() req: ScopedRequest,
  ) {
    this.requireHq(req);
    return this.service.changeStatus(branchId, dto, req.user.sub, req.user.role);
  }

  private requireHq(req: ScopedRequest): void {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ may manage branches");
    }
  }
}
