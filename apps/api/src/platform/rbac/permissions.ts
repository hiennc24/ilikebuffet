/**
 * Permission matrix — role → capability set.
 *
 * Table-driven map. Tests must cover every cell.
 * Capabilities are string literals so the compiler catches typos via the
 * Capability union type.
 */
import { Role } from "./role.enum";

export type Capability =
  // chain config / user management
  | "chain:config:read"
  | "chain:config:write"
  | "chain:user:manage"
  // chain dashboard & reports
  | "chain:dashboard:read"
  | "branch:dashboard:read" // own-branch only for QUAN_LY_CN
  // sales / shift
  | "shift:open-close"
  | "shift:assist" // QUAN_LY_CN can assist cashier
  // discount / cancel bill
  | "discount:approve" // requires approval PIN
  | "bill:cancel" // requires approval PIN
  // cash / reconcile
  | "cash:read"
  | "cash:create-voucher"
  | "cash:reconcile"
  | "cash:close-book"
  // purchase / inventory
  | "inventory:read"
  | "inventory:manage" // full inventory ops (THU_KHO)
  | "purchase-order:approve"
  | "purchase-order:create";

/** Capabilities held by each role. */
const ROLE_CAPABILITIES: Record<Role, Set<Capability>> = {
  [Role.QUAN_TRI_HQ]: new Set<Capability>([
    "chain:config:read",
    "chain:config:write",
    "chain:user:manage",
    "chain:dashboard:read",
    "branch:dashboard:read",
    "cash:read",
    "cash:create-voucher",
    "inventory:read",
    "purchase-order:create",
    "purchase-order:approve",
  ]),

  [Role.CHU_CHUOI]: new Set<Capability>([
    "chain:config:read",
    "chain:dashboard:read",
    "branch:dashboard:read",
    "cash:read",
    "cash:create-voucher",
    "inventory:read",
    "purchase-order:create",
    "purchase-order:approve",
  ]),

  [Role.KE_TOAN_CHUOI]: new Set<Capability>([
    "chain:dashboard:read",
    "branch:dashboard:read",
    "cash:reconcile",
    "cash:close-book",
    "cash:read",
    "cash:create-voucher",
    "inventory:read",
  ]),

  [Role.QUAN_LY_CN]: new Set<Capability>([
    "branch:dashboard:read",
    "shift:assist",
    "discount:approve",
    "bill:cancel",
    "cash:read",
    "cash:create-voucher",
    "purchase-order:create",
    "purchase-order:approve",
  ]),

  [Role.THU_NGAN]: new Set<Capability>([
    "shift:open-close",
    "cash:create-voucher",
  ]),

  [Role.THU_KHO]: new Set<Capability>([
    "inventory:manage",
    "inventory:read",
    "purchase-order:create",
  ]),
};

/**
 * Check if `role` holds `capability`.
 * Usage: `can(user.role, 'shift:open-close')`.
 */
export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role]?.has(capability) ?? false;
}

/** Export the raw map for table-driven tests. */
export { ROLE_CAPABILITIES };
