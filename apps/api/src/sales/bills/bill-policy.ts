/**
 * Bill-level policies — reversible build-defaults.
 *
 * Each policy is a plain object constant so switching is one edit here,
 * not a hunt across the service. The service imports and calls the policy
 * functions; tests can override by re-exporting a different constant if
 * needed (no DI needed — pure policy logic).
 */
import { FREE_TICKET_POLICY } from "@ilikebuffet/shared";

export interface BillPolicyViolation {
  message: string;
}

/**
 * Check whether the bill lines satisfy the free-ticket companion policy.
 *
 * Confirmed policy is "ALLOW_STANDALONE": a free-only bill is valid, so this
 * returns undefined. Kept as a seam — under "REQUIRE_PAID_COMPANION" it requires
 * at least one line with unitPriceVnd > 0. Returns a violation message when the
 * active policy is violated, undefined when OK.
 */
export function checkFreeTicketPolicy(
  lines: Array<{ unitPriceVnd: number }>,
): BillPolicyViolation | undefined {
  if (FREE_TICKET_POLICY.kind !== "REQUIRE_PAID_COMPANION") return undefined;

  const hasPaid = lines.some((l) => l.unitPriceVnd > 0);
  if (!hasPaid) {
    return { message: "Bill phải có ít nhất 1 vé có phí" };
  }
  return undefined;
}
