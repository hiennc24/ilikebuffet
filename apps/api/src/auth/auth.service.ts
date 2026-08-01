/**
 * AuthService — password login, refresh, change-password, PIN login.
 *
 * Security invariants (all reviewed post-audit):
 *
 * Timing-safe dummy hash: precomputed once at construction via argon2.hash()
 *     so unknown-user path runs the full KDF (same timing as wrong-password).
 *
 * Atomic failure counter: uses Prisma { increment: 1 } and decides the lock
 *     from the RETURNED value — closes the read-then-write race.
 *
 * Role-gated PIN setters: setCashierPin → THU_NGAN only;
 *     setApprovalPin → QUAN_LY_CN only. 403 otherwise.
 *
 * PIN-login enumeration collapse: all pre-PIN failure paths return the same
 *     generic message ("Invalid device or PIN") and write an audit row.
 *
 * PIN login checks lockedUntil (password lock blocks PIN quick-login too).
 *
 * L10 Tokens carry typ ("access"/"refresh") and mcp (mustChangePassword).
 *     Refresh token type validated at refresh(); JWT strategy rejects
 *     refresh-as-access (typ≠"access").
 *     TTL env vars are validated at construction (throws on malformed value).
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RevocationService } from "./revocation.service";
import { CHAIN_WIDE_ROLES, Role } from "../platform/rbac/role.enum";
import type {
  LoginDto,
  LoginResponse,
  ChangePasswordDto,
  PinLoginDto,
  RefreshResponse,
} from "./auth.dto";
import type { JwtPayload } from "./jwt.strategy";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_FAILURES = 5;
const MAX_PIN_FAILURES = 5;
const PIN_DIGITS_REGEX = /^\d{6}$/;

/** Generic PIN-login failure message — prevents enumeration. */
const PIN_LOGIN_GENERIC_ERROR = "Invalid device or PIN";

// ─── TTL validation (L10) ─────────────────────────────────────────────────────

/** ms-compatible string pattern — e.g. "15m", "7d", "30s", "3600". */
const MS_PATTERN = /^\d+(\.\d+)?(ms|s|m|h|d|w|y)?$/;

function validateTtl(value: string, name: string): void {
  if (!MS_PATTERN.test(value)) {
    throw new Error(
      `Config error: ${name}="${value}" is not a valid ms/duration string. ` +
        `Examples: "15m", "7d", "900" (seconds).`,
    );
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Timing-safe dummy hash for unknown-user login attempts.
   * Precomputed at module init so unknown users run the full argon2 KDF,
   * matching the timing of an existing-user wrong-password path.
   * The value is intentionally NOT a valid argon2 hash so verify() always
   * returns false — we never accept it; we only need the KDF timing.
   */
  private dummyHash!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly revocation: RevocationService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Validate TTL env at boot — fail fast rather than casting blindly (L10).
    const accessTtl = this.config.get<string>("JWT_ACCESS_TTL", "15m");
    const refreshTtl = this.config.get<string>("JWT_REFRESH_TTL", "7d");
    validateTtl(accessTtl, "JWT_ACCESS_TTL");
    validateTtl(refreshTtl, "JWT_REFRESH_TTL");

    // Precompute a real argon2 hash of a random string for timing parity.
    this.dummyHash = await argon2.hash(randomBytes(16).toString("hex"));
  }

  // ─── Password login ──────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<LoginResponse> {
    const { username, password } = dto;

    const user = await this.prisma.appUser.findUnique({
      where: { username },
      include: { branches: { select: { branchId: true } } },
    });

    if (!user) {
      // Run full KDF against the real dummy hash — timing matches existing-user
      // wrong-password path so callers cannot distinguish the two cases.
      await argon2.verify(this.dummyHash, password);
      await this.auditLoginFailed(null, username, "user_not_found");
      throw new UnauthorizedException("Invalid credentials");
    }

    // Check account lock.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException("Account is locked. Try again later.");
    }

    const valid = await argon2.verify(user.passwordHash, password);

    if (!valid) {
      await this.handleLoginFailureAtomic(user.id);
      await this.auditLoginFailed(user.id, username, "wrong_password");
      throw new UnauthorizedException("Invalid credentials");
    }

    // Successful login — reset failure counter.
    await this.prisma.appUser.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const branchIds = user.branches.map((b) => b.branchId);
    const chainWide = CHAIN_WIDE_ROLES.has(user.role as Role);
    const tokens = this.issueTokens(
      user.id, user.username, user.role, chainWide, branchIds,
      user.tokenVersion, user.mustChangePassword,
    );

    this.logger.log(`Login success: user=${user.id} role=${user.role}`);
    return { ...tokens, mustChangePassword: user.mustChangePassword };
  }

  // ─── Token refresh ────────────────────────────────────────────────────────

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Reject access tokens presented as refresh tokens (L10).
    if (payload.typ !== "refresh") {
      throw new UnauthorizedException("Invalid token type");
    }

    // Re-read from DB: role/branch changes take effect at refresh (spec).
    const user = await this.prisma.appUser.findUnique({
      where: { id: payload.sub },
      include: { branches: { select: { branchId: true } } },
    });
    if (!user) throw new UnauthorizedException("User not found");
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException("Account is locked");
    }

    // Verify tv — refresh token must not be revoked either.
    if (payload.tv < user.tokenVersion) {
      throw new UnauthorizedException("Token has been revoked");
    }

    const branchIds = user.branches.map((b) => b.branchId);
    const chainWide = CHAIN_WIDE_ROLES.has(user.role as Role);
    const { accessToken } = this.issueTokens(
      user.id, user.username, user.role, chainWide, branchIds,
      user.tokenVersion, user.mustChangePassword,
    );
    return { accessToken };
  }

  // ─── Change password ──────────────────────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const { currentPassword, newPassword } = dto;

    if (newPassword.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }

    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) throw new UnauthorizedException("Current password is incorrect");

    const newHash = await argon2.hash(newPassword);
    await this.prisma.appUser.update({
      where: { id: userId },
      data: { passwordHash: newHash, mustChangePassword: false },
    });
  }

  // ─── PIN login (device quick-login, NT-04) ────────────────────────────────

  async pinLogin(dto: PinLoginDto): Promise<LoginResponse> {
    const { deviceId, deviceSecret, userId, pin } = dto;

    // Validate PIN format early (cheap, not timing-sensitive).
    if (!PIN_DIGITS_REGEX.test(pin)) {
      throw new BadRequestException("PIN must be exactly 6 digits");
    }

    // Device must be in server registry. Collapse error messages to prevent enumeration.
    const device = await this.prisma.device.findUnique({ where: { deviceId } });
    if (!device || device.status !== "ACTIVE") {
      await this.auditPinLoginFailed(null, deviceId, "device_not_found");
      throw new ForbiddenException(PIN_LOGIN_GENERIC_ERROR);
    }

    // Verify device secret — use argon2.verify which is timing-safe.
    const secretValid = await argon2.verify(device.secretHash, deviceSecret);
    if (!secretValid) {
      await this.auditPinLoginFailed(null, deviceId, "bad_device_secret");
      throw new ForbiddenException(PIN_LOGIN_GENERIC_ERROR);
    }

    // Load user.
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      include: { branches: { select: { branchId: true } } },
    });
    if (!user) {
      await this.auditPinLoginFailed(null, deviceId, "user_not_found");
      throw new ForbiddenException(PIN_LOGIN_GENERIC_ERROR);
    }

    // Password lock also blocks PIN quick-login.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.auditPinLoginFailed(user.id, deviceId, "account_locked");
      throw new UnauthorizedException(PIN_LOGIN_GENERIC_ERROR);
    }

    // User must be a cashier of this device's branch (same generic message to prevent enumeration).
    const isMember = user.branches.some((b) => b.branchId === device.branchId);
    if (!isMember) {
      await this.auditPinLoginFailed(user.id, deviceId, "not_branch_member");
      throw new ForbiddenException(PIN_LOGIN_GENERIC_ERROR);
    }

    // Check PIN lock.
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      await this.auditPinLoginFailed(user.id, deviceId, "pin_locked");
      throw new UnauthorizedException(PIN_LOGIN_GENERIC_ERROR);
    }

    // Cashier PIN must be set.
    if (!user.cashierPinHash) {
      await this.auditPinLoginFailed(user.id, deviceId, "pin_not_set");
      throw new UnauthorizedException(PIN_LOGIN_GENERIC_ERROR);
    }

    // Verify cashier PIN (NOT approval PIN — dual-PIN invariant).
    const pinValid = await argon2.verify(user.cashierPinHash, pin);
    if (!pinValid) {
      await this.handlePinFailureAtomic(user.id);
      await this.auditPinLoginFailed(user.id, deviceId, "wrong_pin");
      throw new UnauthorizedException(PIN_LOGIN_GENERIC_ERROR);
    }

    // Reset PIN failure counter on success.
    await this.prisma.appUser.update({
      where: { id: user.id },
      data: { pinFailedCount: 0, pinLockedUntil: null },
    });

    const branchIds = user.branches.map((b) => b.branchId);
    const chainWide = CHAIN_WIDE_ROLES.has(user.role as Role);
    // PIN login is device-bound — carry the deviceId so offline sync can enforce
    // that a device only syncs its own bills.
    const tokens = this.issueTokens(
      user.id, user.username, user.role, chainWide, branchIds,
      user.tokenVersion, user.mustChangePassword, deviceId,
    );
    return { ...tokens, mustChangePassword: user.mustChangePassword };
  }

  // ─── PIN management (role-gated) ─────────────────────────────────────────

  /**
   * Set the cashier quick-login PIN. Only THU_NGAN may call this.
   * cashierPinHash is separate from approvalPinHash (dual-PIN invariant).
   */
  async setCashierPin(userId: string, pin: string, callerRole: string): Promise<void> {
    if (callerRole !== Role.THU_NGAN) {
      throw new ForbiddenException("Only cashiers (THU_NGAN) may set a cashier PIN");
    }
    if (!PIN_DIGITS_REGEX.test(pin)) {
      throw new BadRequestException("Cashier PIN must be exactly 6 digits");
    }
    const hash = await argon2.hash(pin);
    await this.prisma.appUser.update({
      where: { id: userId },
      data: { cashierPinHash: hash },
    });
  }

  /**
   * Set the approval PIN. Only QUAN_LY_CN may call this.
   * approvalPinHash is separate from cashierPinHash (dual-PIN invariant).
   */
  async setApprovalPin(userId: string, pin: string, callerRole: string): Promise<void> {
    if (callerRole !== Role.QUAN_LY_CN) {
      throw new ForbiddenException("Only branch managers (QUAN_LY_CN) may set an approval PIN");
    }
    if (!PIN_DIGITS_REGEX.test(pin)) {
      throw new BadRequestException("Approval PIN must be exactly 6 digits");
    }
    const hash = await argon2.hash(pin);
    await this.prisma.appUser.update({
      where: { id: userId },
      data: { approvalPinHash: hash },
    });
  }

  // ─── Logout all / revoke ──────────────────────────────────────────────────

  /**
   * Bump tokenVersion for the user and invalidate Redis immediately.
   * All existing access + refresh tokens are rejected on next check (≤20s).
   */
  async revokeAllSessions(userId: string): Promise<void> {
    const user = await this.prisma.appUser.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    // Invalidate (DEL) then warm cache — safe even if warm fails.
    await this.revocation.invalidateAndSet(userId, user.tokenVersion);
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Atomic login failure increment (closes concurrent-wrong-password race).
   * Uses { increment: 1 } and decides lock from the RETURNED count.
   */
  private async handleLoginFailureAtomic(userId: string): Promise<void> {
    const updated = await this.prisma.appUser.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true, tokenVersion: true },
    });

    if (updated.failedLoginCount >= MAX_LOGIN_FAILURES) {
      const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      // Bump tv to revoke live tokens. Separate update so we get the
      // new tv value; failure counter already committed above.
      const withTv = await this.prisma.appUser.update({
        where: { id: userId },
        data: { lockedUntil, tokenVersion: { increment: 1 } },
        select: { tokenVersion: true },
      });
      // Invalidate Redis — stale pre-lock tv is gone immediately.
      await this.revocation.invalidateAndSet(userId, withTv.tokenVersion);
    }
  }

  /**
   * Atomic PIN failure increment.
   * Uses { increment: 1 } and decides lock from the RETURNED count.
   */
  private async handlePinFailureAtomic(userId: string): Promise<void> {
    const updated = await this.prisma.appUser.update({
      where: { id: userId },
      data: { pinFailedCount: { increment: 1 } },
      select: { pinFailedCount: true },
    });

    if (updated.pinFailedCount >= MAX_PIN_FAILURES) {
      const pinLockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      await this.prisma.appUser.update({
        where: { id: userId },
        data: { pinLockedUntil },
      });
    }
  }

  private async auditLoginFailed(
    userId: string | null,
    username: string,
    reason: string,
  ): Promise<void> {
    await this.audit
      .record(this.prisma, {
        actorId: userId ?? undefined,
        action: "auth.login_failed",
        objectType: "user",
        objectId: userId ?? undefined,
        reason: `Login failed for username=${username}: ${reason}`,
      })
      .catch((err) => this.logger.error("Audit write failed for login_failed", err));
  }

  private async auditPinLoginFailed(
    userId: string | null,
    deviceId: string,
    reason: string,
  ): Promise<void> {
    await this.audit
      .record(this.prisma, {
        actorId: userId ?? undefined,
        action: "auth.pin_login_failed",
        objectType: "device",
        objectId: deviceId,
        deviceId,
        reason: `PIN login failed: ${reason}`,
      })
      .catch((err) => this.logger.error("Audit write failed for pin_login_failed", err));
  }

  /**
   * Issue a matched access+refresh pair.
   * Both carry: sub, username, role, chainWide, branchIds, tv, mcp, typ (L10).
   */
  private issueTokens(
    userId: string,
    username: string,
    role: string,
    chainWide: boolean,
    branchIds: string[],
    tv: number,
    mcp: boolean,
    deviceId?: string,
  ): { accessToken: string; refreshToken: string } {
    const base = { sub: userId, username, role, chainWide, branchIds, tv, mcp, ...(deviceId ? { deviceId } : {}) };

    const accessTtl = this.config.get<string>("JWT_ACCESS_TTL", "15m");
    const refreshTtl = this.config.get<string>("JWT_REFRESH_TTL", "7d");

    const accessToken = this.jwt.sign(
      { ...base, typ: "access" } satisfies Omit<JwtPayload, "iat" | "exp">,
      {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
        // Safe cast: validated at onModuleInit().
        expiresIn: accessTtl as "15m",
      },
    );

    const refreshToken = this.jwt.sign(
      { ...base, typ: "refresh" } satisfies Omit<JwtPayload, "iat" | "exp">,
      {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: refreshTtl as "7d",
      },
    );

    return { accessToken, refreshToken };
  }
}
