/**
 * Global JWT authentication guard — fail-closed: every route is authenticated by default.
 * Opt-out via @Public() decorator only.
 *
 * Per-request checks (in order):
 *  1. @Public() → pass without token.
 *  2. Passport validates JWT signature + expiry.
 *  3. typ claim must be "access" (not "refresh") — L10.
 *  4. Token-version check via RevocationService (Redis + DB fallback).
 *     Locking / logout-all bumps DB tv AND invalidates Redis → ≤30s revocation.
 *  5. mustChangePassword gate: if mcp=true in token AND route is not
 *     @Public / @PasswordChangeAllowed → 403 "password change required".
 */
import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { PrismaService } from "../prisma/prisma.service";
import { RevocationService } from "./revocation.service";
import { PUBLIC_KEY, PASSWORD_CHANGE_ALLOWED_KEY } from "../platform/rbac/decorators";
import type { JwtPayload } from "./jwt.strategy";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly revocation: RevocationService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Routes marked @Public() bypass auth entirely.
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Validate JWT signature + expiry via passport (also rejects wrong typ via strategy).
    const authenticated = await super.canActivate(context);
    if (!authenticated) return false;

    const request = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    const payload = request.user;

    // Per-request revocation check: compare JWT tv with Redis/DB tv.
    const currentTv = await this.revocation.getCurrentTv(payload.sub, async () => {
      const user = await this.prisma.appUser.findUnique({
        where: { id: payload.sub },
        select: { tokenVersion: true },
      });
      return user?.tokenVersion ?? -1;
    });

    if (payload.tv < currentTv) {
      this.logger.warn(`Revoked token for user ${payload.sub} (tv=${payload.tv} < stored=${currentTv})`);
      throw new UnauthorizedException("Token has been revoked");
    }

    // mustChangePassword gate: block all routes except @PasswordChangeAllowed.
    if (payload.mcp) {
      const allowed = this.reflector.getAllAndOverride<boolean>(PASSWORD_CHANGE_ALLOWED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) {
        throw new ForbiddenException("Password change required before continuing");
      }
    }

    return true;
  }

  /** Passport calls this on validation error; convert to UnauthorizedException. */
  handleRequest<T>(err: Error | null, user: T): T {
    if (err || !user) {
      throw new UnauthorizedException(err?.message ?? "Unauthorized");
    }
    return user;
  }
}
