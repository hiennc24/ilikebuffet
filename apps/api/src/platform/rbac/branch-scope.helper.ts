/**
 * BranchScopeHelper — DB-level branch filter enforcer.
 *
 * BranchScopeGuard handles the HTTP boundary (keyed-route membership check +
 * cross_branch_denied audit). This helper enforces scope at the DB query
 * boundary — a second, independent line of defence.
 *
 * Repositories that query branch-keyed data MUST:
 *   1. Call requireScope(req) to get the BranchFilter.
 *   2. Pass the filter as the branchId WHERE clause.
 *
 * requireScope() reads req.branchScope (set by BranchScopeGuard on every
 * scoped request). If branchScope is missing the request never went through
 * the guard — this is a programming error; throw immediately.
 *
 * The old "__denied__" sentinel is replaced by a thrown InternalServerError
 * so bugs are loud, not silent.
 *
 * TODO: CI lint rule to flag repository methods that skip requireScope().
 */
import { InternalServerErrorException } from "@nestjs/common";
import { Request } from "express";
import type { BranchScopeContext } from "./branch-scope.guard";

/** Prisma-compatible branchId filter produced by allowedBranchFilter(). */
export type BranchFilter = string | { in: string[] };

/** Express request that has been processed by BranchScopeGuard. */
type RequestWithScope = Request & { branchScope?: BranchScopeContext };

export class BranchScopeHelper {
  /**
   * Extract the scope context from a request and return a Prisma-compatible
   * branchId filter.
   *
   * Throws InternalServerErrorException if branchScope is absent (guard bypass).
   *
   * @param req              Express request (must have passed BranchScopeGuard).
   * @param requestedBranch  Specific branchId from the route/body/query, if any.
   */
  static requireScope(req: RequestWithScope, requestedBranch?: string | null): BranchFilter | undefined {
    const scope = req.branchScope;
    if (!scope) {
      // Guard was bypassed — fail loud, not silent.
      throw new InternalServerErrorException(
        "branchScope missing: route must pass through BranchScopeGuard",
      );
    }
    return BranchScopeHelper.allowedBranchFilter(scope, requestedBranch);
  }

  /**
   * Build a Prisma-compatible branchId filter from an explicit scope context.
   * Prefer requireScope(req) in request handlers; use this directly only in
   * unit tests or service-layer helpers that already hold the scope object.
   *
   * Chain-wide scope → undefined (no branchId filter; sees all branches).
   * Scoped, specific branch → exact string (guard already verified membership).
   * Scoped, no specific branch → { in: [...userBranches] }.
   * Scoped, no branches → throws ForbiddenException (empty allowlist).
   */
  static allowedBranchFilter(
    scope: BranchScopeContext,
    requestedBranch?: string | null,
  ): BranchFilter | undefined {
    if (scope.chainWide) {
      // Chain-wide: pass through the requested branch (or no filter at all).
      return requestedBranch ?? undefined;
    }

    const allowed = scope.branchIds;

    if (requestedBranch) {
      // Guard already verified membership for keyed routes.
      // Double-check here as defence-in-depth; throw rather than silently deny.
      if (!allowed.includes(requestedBranch)) {
        throw new InternalServerErrorException(
          "BranchScopeHelper: requested branch not in user scope (guard should have blocked this)",
        );
      }
      return requestedBranch;
    }

    // No specific branch requested — filter to all user's branches.
    if (allowed.length === 0) {
      throw new InternalServerErrorException(
        "BranchScopeHelper: user has no branch memberships",
      );
    }
    if (allowed.length === 1) return allowed[0]!;
    return { in: allowed };
  }
}
