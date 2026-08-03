/**
 * Device registration endpoints.
 * Registration is scoped to a branch — the requesting user must be a member
 * of the branch (or chain-wide) and hold HQ or QUAN_LY_CN role.
 * The branchId in the body triggers BranchScopeGuard automatically.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Request,
} from "@nestjs/common";
import { DeviceService, RegisterDeviceResponse } from "./device.service";
import { PermissionService } from "../rbac/permission.service";
import type { JwtPayload } from "../../auth/jwt.strategy";

interface DeviceRequest {
  user: JwtPayload;
}

interface RegisterBody {
  branchId: string;
  label?: string;
}

@Controller("platform/devices")
export class DeviceController {
  constructor(
    private readonly devices: DeviceService,
    private readonly perms: PermissionService,
  ) {}

  /**
   * GET /platform/devices?branchId=  — list devices for the admin screen.
   * HQ + branch managers only; branch-scoped in the service. No secret hash.
   */
  @Get()
  async list(@Query("branchId") branchId: string, @Request() req: DeviceRequest) {
    if (!(await this.perms.can(req.user.role, "device:manage"))) {
      throw new ForbiddenException("Không có quyền xem thiết bị");
    }
    return this.devices.list(branchId || undefined, {
      chainWide: req.user.chainWide,
      branchIds: req.user.branchIds,
    });
  }

  /**
   * POST /platform/devices/register
   * Body: { branchId, label? }
   * BranchScopeGuard reads branchId from body → enforces membership automatically.
   * Role check: only QUAN_TRI_HQ or QUAN_LY_CN may register devices.
   */
  @Post("register")
  async register(
    @Request() req: DeviceRequest,
    @Body() body: RegisterBody,
  ): Promise<RegisterDeviceResponse> {
    if (!(await this.perms.can(req.user.role, "device:manage"))) {
      throw new ForbiddenException("Only HQ or branch managers may register devices");
    }
    if (!body.branchId) {
      throw new ForbiddenException("branchId is required");
    }
    return this.devices.register({ branchId: body.branchId, label: body.label });
  }

  /**
   * POST /platform/devices/:deviceId/suspend
   * Only QUAN_TRI_HQ may suspend any device; QUAN_LY_CN may suspend devices
   * in their own branch (branchId checked via header x-branch-id by guard).
   */
  @Post(":deviceId/suspend")
  async suspend(
    @Request() req: DeviceRequest,
    @Param("deviceId") deviceId: string,
  ): Promise<{ ok: true }> {
    if (!(await this.perms.can(req.user.role, "device:manage"))) {
      throw new ForbiddenException("Only HQ or branch managers may suspend devices");
    }
    await this.devices.suspend(deviceId);
    return { ok: true };
  }
}
