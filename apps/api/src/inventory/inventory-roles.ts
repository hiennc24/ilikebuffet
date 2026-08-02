import { Role } from "../platform/rbac/role.enum";

/**
 * Who may mutate inventory (create/edit purchase orders, receive goods, issue
 * and adjust stock): the warehouse keeper plus branch manager and the two
 * chain-wide admin roles. All still branch-scoped by BranchScopeGuard.
 */
export const INVENTORY_WRITE_ROLES = new Set<Role>([
  Role.THU_KHO,
  Role.QUAN_LY_CN,
  Role.QUAN_TRI_HQ,
  Role.CHU_CHUOI,
]);

/**
 * Who may read inventory (stock levels, movements, valuation): the write roles
 * plus chain accountant, who needs stock value for reporting but not mutation.
 */
export const INVENTORY_VIEW_ROLES = new Set<Role>([
  ...INVENTORY_WRITE_ROLES,
  Role.KE_TOAN_CHUOI,
]);
