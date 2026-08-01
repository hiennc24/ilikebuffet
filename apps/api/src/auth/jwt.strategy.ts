/**
 * Passport JWT strategy. Validates the bearer token and loads the minimal
 * user payload into request.user. Token version (tv) is checked per-request
 * in JwtAuthGuard via RevocationService.
 *
 * Payload additions (security review fixes):
 *  - mcp (mustChangePassword): carried in access token; JwtAuthGuard enforces
 *    the gate so users with mcp=true can only reach @PasswordChangeAllowed routes.
 *  - typ ("access" | "refresh"): guards reject tokens with the wrong type,
 *    preventing refresh-as-access and vice versa (L10).
 */
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

export interface JwtPayload {
  /** Subject = AppUser.id */
  sub: string;
  username: string;
  role: string;
  /** true if user has chain-wide access (no branch filter needed) */
  chainWide: boolean;
  /** Branch IDs the user belongs to (empty for chain-wide roles) */
  branchIds: string[];
  /** Token version — bumped on logout-all / account lock */
  tv: number;
  /** mustChangePassword — carried in access token; enforced per-request */
  mcp: boolean;
  /** Device this token is bound to — set only for PIN (device) login. Offline
   *  sync enforces bill.deviceId === this when present. */
  deviceId?: string;
  /** Token type — "access" or "refresh"; guards reject the wrong type (L10) */
  typ: "access" | "refresh";
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET"),
    });
  }

  /** Called after signature/expiry verified. Return value is set as request.user. */
  validate(payload: JwtPayload): JwtPayload {
    if (!payload.sub || !payload.role) {
      throw new UnauthorizedException("Invalid token payload");
    }
    // Reject refresh tokens presented as access tokens (L10).
    if (payload.typ !== "access") {
      throw new UnauthorizedException("Invalid token type");
    }
    return payload;
  }
}
