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
  // reporting
  | "report:view" // any report page (branch-scoped)
  | "report:chain-view" // chain-level overview (chain roles only)
  // system / audit
  | "audit:view" // read audit log
  | "device:manage" // register / suspend POS devices
  // sales / shift
  | "shift:open-close"
  | "shift:assist" // QUAN_LY_CN can assist cashier
  // discount / cancel bill
  | "discount:approve" // requires approval PIN
  | "bill:cancel" // requires approval PIN
  | "bill:manage" // order management (refund, override)
  // cash / reconcile
  | "cash:read"
  | "cash:create-voucher"
  | "cash:reconcile"
  | "cash:close-book"
  | "bank:reconcile" // bank-statement reconciliation (chain accounting)
  // purchase / inventory
  | "inventory:read"
  | "inventory:manage" // full inventory ops
  | "inventory:transfer" // inter-branch stock transfers
  | "recipe:manage-chain" // chain-wide recipe (định mức) default
  | "recipe:manage-branch" // per-branch recipe override
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
    "report:view",
    "report:chain-view",
    "audit:view",
    "device:manage",
    "cash:read",
    "cash:create-voucher",
    "bank:reconcile",
    "bill:manage",
    "inventory:read",
    "inventory:manage",
    "inventory:transfer",
    "recipe:manage-chain",
    "recipe:manage-branch",
    "purchase-order:create",
    "purchase-order:approve",
  ]),

  [Role.CHU_CHUOI]: new Set<Capability>([
    "chain:config:read",
    "chain:dashboard:read",
    "branch:dashboard:read",
    "report:view",
    "report:chain-view",
    "cash:read",
    "cash:create-voucher",
    "bank:reconcile",
    "bill:manage",
    "inventory:read",
    "inventory:manage",
    "inventory:transfer",
    "recipe:manage-chain",
    "recipe:manage-branch",
    "purchase-order:create",
    "purchase-order:approve",
  ]),

  [Role.KE_TOAN_CHUOI]: new Set<Capability>([
    "chain:dashboard:read",
    "branch:dashboard:read",
    "report:view",
    "report:chain-view",
    "cash:reconcile",
    "cash:close-book",
    "cash:read",
    "cash:create-voucher",
    "bank:reconcile",
    "inventory:read",
  ]),

  [Role.QUAN_LY_CN]: new Set<Capability>([
    "chain:user:manage",
    "branch:dashboard:read",
    "report:view",
    "audit:view",
    "device:manage",
    "shift:assist",
    "discount:approve",
    "bill:cancel",
    "bill:manage",
    "cash:read",
    "cash:create-voucher",
    "inventory:read",
    "inventory:manage",
    "inventory:transfer",
    "recipe:manage-branch",
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
