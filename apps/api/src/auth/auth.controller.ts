/**
 * Auth controller — public endpoints for login/refresh + authenticated
 * endpoints for password change and PIN management.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Request,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { Public, Unscoped, PasswordChangeAllowed } from "../platform/rbac/decorators";
import type {
  ChangePasswordDto,
  LoginDto,
  LoginResponse,
  PinLoginDto,
  RefreshDto,
  RefreshResponse,
  SetApprovalPinDto,
  SetCashierPinDto,
} from "./auth.dto";
import type { JwtPayload } from "./jwt.strategy";

interface AuthRequest {
  user: JwtPayload;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /auth/login — no auth required (public endpoint). */
  @Public()
  @Post("login")
  async login(@Body() body: LoginDto): Promise<LoginResponse> {
    if (!body.username || !body.password) {
      throw new BadRequestException("username and password are required");
    }
    return this.auth.login(body);
  }

  /** POST /auth/refresh — no auth header needed (refresh token in body). */
  @Public()
  @Post("refresh")
  async refresh(@Body() body: RefreshDto): Promise<RefreshResponse> {
    if (!body.refreshToken) {
      throw new BadRequestException("refreshToken is required");
    }
    return this.auth.refresh(body.refreshToken);
  }

  /**
   * POST /auth/change-password — authenticated, chain-wide (user changes their
   * own password; not branch-keyed).
   * @PasswordChangeAllowed — exempt from the mustChangePassword gate so
   * users with mcp=true can reach this endpoint to satisfy the requirement.
   */
  @Unscoped()
  @PasswordChangeAllowed()
  @Post("change-password")
  async changePassword(
    @Request() req: AuthRequest,
    @Body() body: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException("currentPassword and newPassword are required");
    }
    await this.auth.changePassword(req.user.sub, body);
    return { ok: true };
  }

  /**
   * POST /auth/pin-login — device quick-login for cashiers.
   * @Public because the JWT for the session is issued here.
   */
  @Public()
  @Post("pin-login")
  async pinLogin(@Body() body: PinLoginDto): Promise<LoginResponse> {
    if (!body.deviceId || !body.deviceSecret || !body.userId || !body.pin) {
      throw new BadRequestException("deviceId, deviceSecret, userId, and pin are required");
    }
    return this.auth.pinLogin(body);
  }

  /**
   * POST /auth/profile/cashier-pin — THU_NGAN sets their quick-login PIN.
   * Role gate is enforced in AuthService.setCashierPin().
   */
  @Unscoped()
  @Post("profile/cashier-pin")
  async setCashierPin(
    @Request() req: AuthRequest,
    @Body() body: SetCashierPinDto,
  ): Promise<{ ok: true }> {
    if (!body.pin) throw new BadRequestException("pin is required");
    await this.auth.setCashierPin(req.user.sub, body.pin, req.user.role);
    return { ok: true };
  }

  /**
   * POST /auth/profile/approval-pin — QUAN_LY_CN sets their approval PIN.
   * Role gate is enforced in AuthService.setApprovalPin().
   */
  @Unscoped()
  @Post("profile/approval-pin")
  async setApprovalPin(
    @Request() req: AuthRequest,
    @Body() body: SetApprovalPinDto,
  ): Promise<{ ok: true }> {
    if (!body.pin) throw new BadRequestException("pin is required");
    await this.auth.setApprovalPin(req.user.sub, body.pin, req.user.role);
    return { ok: true };
  }

  /** POST /auth/logout-all — revoke all live sessions for this user. */
  @Unscoped()
  @Post("logout-all")
  async logoutAll(@Request() req: AuthRequest): Promise<{ ok: true }> {
    await this.auth.revokeAllSessions(req.user.sub);
    return { ok: true };
  }
}
