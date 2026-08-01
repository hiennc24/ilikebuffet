import { ForbiddenException } from "@nestjs/common";

/**
 * The caller's branch reach, taken from the JWT (`chainWide` + `branchIds`).
 *
 * The global BranchScopeGuard only enforces membership when a request carries a
 * branchId (body/param/query/header). Routes keyed only by a resource id
 * (e.g. POST /sales/bills/:id/payments, /sales/shifts/:id/close) pass the guard
 * "keyless", so the service must re-check the RESOURCE's branch against the
 * caller here — otherwise a member of branch A could act on branch B by id.
 */
export interface BranchAccess {
  chainWide: boolean;
  branchIds: string[];
}

/** True when the caller may act on `branchId`. */
export function canAccessBranch(access: BranchAccess, branchId: string): boolean {
  return access.chainWide || access.branchIds.includes(branchId);
}

/** Throw 403 unless the caller may act on `branchId`. */
export function assertBranchAccess(access: BranchAccess, branchId: string): void {
  if (!canAccessBranch(access, branchId)) {
    throw new ForbiddenException("Ngoài phạm vi chi nhánh");
  }
}
