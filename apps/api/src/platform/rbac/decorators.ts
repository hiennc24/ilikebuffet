/**
 * Route-level metadata decorators for the global guard system (fail-closed).
 *
 * Default (no decorator): JwtAuthGuard + BranchScopeGuard both apply.
 * @Public()             — skip auth entirely (login, health endpoints).
 * @Unscoped()           — auth required, branch scope skipped (HQ config routes).
 * @PasswordChangeAllowed() — auth required; exempts the route from the
 *                            mustChangePassword gate so users can change their
 *                            password even with mcp=true in the token.
 *
 * CI allowlist of @Unscoped/@PasswordChangeAllowed routes stays short and
 * reviewable; adding one requires an explicit annotation.
 */
import { SetMetadata } from "@nestjs/common";

export const PUBLIC_KEY = "isPublic";
export const UNSCOPED_KEY = "isUnscoped";
export const PASSWORD_CHANGE_ALLOWED_KEY = "passwordChangeAllowed";

/**
 * Mark a route as public — no JWT required.
 * Use only for: /auth/login, /auth/pin-login, /health.
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Mark a route as authentication-required but NOT branch-scoped.
 * Use only for chain-wide HQ/config endpoints where branchId is irrelevant.
 * Every @Unscoped route is auditable in CI by grepping for this decorator.
 */
export const Unscoped = () => SetMetadata(UNSCOPED_KEY, true);

/**
 * Allow this route to be called when mustChangePassword=true (mcp claim).
 * Without this decorator, a user whose password must be changed is blocked
 * with 403 on every non-public route except this one.
 * Use ONLY on POST /auth/change-password.
 */
export const PasswordChangeAllowed = () => SetMetadata(PASSWORD_CHANGE_ALLOWED_KEY, true);
