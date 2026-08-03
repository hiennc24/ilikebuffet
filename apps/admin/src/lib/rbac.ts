/**
 * Client-side RBAC for screen visibility/routing.
 *
 * The SERVER is always the gate (every endpoint is role- and branch-checked).
 * This module only decides which screens to SHOW/route so a user isn't offered
 * controls that would 403. Default-allow: only the sensitive M2 screens listed
 * here are restricted; everything else stays visible as before.
 */

/** Decode the `role` claim from a JWT access token (no verification — display only). */
export function decodeRole(token: string | null | undefined): string | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

/**
 * Screens whose visibility is restricted, keyed by route path. A path not listed
 * here is allowed for any authenticated role (preserves M1 behavior).
 */
export const RESTRICTED_SCREENS: Record<string, readonly string[]> = {
  "/orders": ["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI", "QUAN_LY_CN"],
  "/settings/branches": ["QUAN_TRI_HQ", "CHU_CHUOI"],
  "/master-data/suppliers": ["QUAN_TRI_HQ", "CHU_CHUOI", "QUAN_LY_CN"],
  "/settings/users": ["QUAN_TRI_HQ", "QUAN_LY_CN"],
  "/settings/log": ["QUAN_TRI_HQ", "QUAN_LY_CN"],
  "/devices": ["QUAN_TRI_HQ", "CHU_CHUOI", "QUAN_LY_CN"],
  "/master-data/holidays": ["QUAN_TRI_HQ"],
  "/inventory": ["QUAN_TRI_HQ"],
  "/master-data/accounts": ["QUAN_TRI_HQ"],
  "/inventory/purchase-orders": ["QUAN_TRI_HQ", "CHU_CHUOI", "QUAN_LY_CN", "THU_KHO"],
  "/inventory/stock": ["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI", "QUAN_LY_CN", "THU_KHO"],
  "/inventory/recipes": ["QUAN_TRI_HQ", "CHU_CHUOI"],
  "/reports/revenue": ["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI", "QUAN_LY_CN"],
  "/reports/gross-margin": ["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI", "QUAN_LY_CN"],
  "/reports/bank-reconcile": ["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI"],
  "/reports/chain": ["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI"],
  "/reports/shift-cash": ["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI", "QUAN_LY_CN"],
  "/reports/offline": ["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI", "QUAN_LY_CN"],
};

/** Whether a role may access a given route path. Unknown paths are allowed. */
export function canAccessPath(role: string | null, path: string): boolean {
  const allowed = RESTRICTED_SCREENS[path];
  if (!allowed) return true;
  return role != null && allowed.includes(role);
}
