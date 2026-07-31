/**
 * Global branch-scoping guard (Red Team H2 — fail-closed on keyed routes).
 *
 * Registered as APP_GUARD (second, after JwtAuthGuard). Applies to every
 * authenticated route by default. Opt-out:
 *   @Public()   — no auth, no scope (login, health)
 *   @Unscoped() — auth required, scope check skipped (HQ chain-wide config)
 *
 * Contract (C1 fix — replaces the old "fail-open on keyless" behaviour):
 *
 *   For EVERY scoped request (not @Public / @Unscoped) the guard attaches
 *   scope context to the request:
 *     req.branchScope = { chainWide: boolean, branchIds: string[] }
 *
 *   When a branchId IS present in the request (param/body/query/x-branch-id):
 *     chainWide OR member → pass.
 *     Not a member        → 403 + audit `cross_branch_denied`.
 *
 *   When NO branchId is present:
 *     The guard PASSES (a keyless route need not carry a branchId — e.g.
 *     /auth/me), but req.branchScope is still populated. Repositories that
 *     query branch-keyed data MUST call BranchScopeHelper.requireScope(req)
 *     and use the returned filter — that is the DB-level enforcement boundary.
 *
 *   TODO (P4): add a CI lint rule that flags data-repository methods that do
 *   not call requireScope(), once the repository layer exists.
 *
 * Branch resolution order from the HTTP request:
 *   1. Route param  :branchId
 *   2. Body field   branchId
 *   3. Query param  branchId
 *   4. Header       x-branch-id
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PUBLIC_KEY, UNSCOPED_KEY } from "./decorators";
import type { JwtPayload } from "../../auth/jwt.strategy";

/** Scope context attached to every scoped request by BranchScopeGuard. */
export interface BranchScopeContext {
  chainWide: boolean;
  branchIds: string[];
}

/** Express request augmented with scope context. */
export type ScopedRequest = Request & {
  user: JwtPayload;
  branchScope: BranchScopeContext;
};

@Injectable()
export class BranchScopeGuard implements CanActivate {
  private readonly logger = new Logger(BranchScopeGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public routes — no auth, no scope.
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // @Unscoped routes — authenticated but chain-wide; skip branch check.
    const isUnscoped = this.reflector.getAllAndOverride<boolean>(UNSCOPED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isUnscoped) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload; branchScope?: BranchScopeContext }>();
    const user = request.user;

    // JwtAuthGuard runs first; no user here means a guard ordering bug — deny.
    if (!user) {
      throw new ForbiddenException("No authenticated user");
    }

    // Attach scope context to request — always, even when no branchId present.
    // BranchScopeHelper.requireScope() reads this; repositories MUST use it.
    request.branchScope = {
      chainWide: user.chainWide,
      branchIds: user.branchIds,
    };

    // Chain-wide roles (HQ, Chủ chuỗi, Kế toán) pass unconditionally.
    if (user.chainWide) return true;

    // Extract target branchId from the request (keyed routes only).
    const targetBranchId = this.extractBranchId(request);

    // No branchId present — keyless route. Guard passes; DB enforcement is via
    // BranchScopeHelper.requireScope() in the repository layer.
    if (!targetBranchId) return true;

    // Membership check for keyed routes.
    if (user.branchIds.includes(targetBranchId)) return true;

    // Cross-branch access — deny + audit (best-effort, non-blocking).
    this.logger.warn(
      `cross_branch_denied user=${user.sub} role=${user.role} target=${targetBranchId}`,
    );
    void this.audit
      .record(this.prisma, {
        actorId: user.sub,
        actorRole: user.role,
        action: "cross_branch_denied",
        objectType: "branch",
        objectId: targetBranchId,
        branchId: targetBranchId,
        reason: `User ${user.username ?? user.sub} attempted cross-branch access`,
      })
      .catch((err) => this.logger.error("Audit write failed for cross_branch_denied", err));

    throw new ForbiddenException("Access denied: cross-branch request");
  }

  private extractBranchId(request: Request): string | null {
    const params = request.params as Record<string, string> | undefined;
    if (params?.["branchId"]) return params["branchId"];

    const body = request.body as Record<string, unknown> | undefined;
    if (body && typeof body["branchId"] === "string") return body["branchId"];

    const query = request.query as Record<string, unknown>;
    if (typeof query["branchId"] === "string") return query["branchId"];

    const header = request.headers["x-branch-id"];
    if (typeof header === "string") return header;

    return null;
  }
}
