/**
 * The 6 built-in role codes (RBAC-01). Roles are now DB-backed (the `role` table)
 * and CRUD-able; these constants name the SYSTEM roles seeded isSystem=true and
 * referenced in code (default capability matrix, chain-wide set). AppUser.role is a
 * free string (a role.code) — custom roles use codes outside this enum.
 */
export enum Role {
  QUAN_TRI_HQ = "QUAN_TRI_HQ",
  CHU_CHUOI = "CHU_CHUOI",
  KE_TOAN_CHUOI = "KE_TOAN_CHUOI",
  QUAN_LY_CN = "QUAN_LY_CN",
  THU_NGAN = "THU_NGAN",
  THU_KHO = "THU_KHO",
}

/** Human-readable display names for audit/logging */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.QUAN_TRI_HQ]: "Quản trị HQ",
  [Role.CHU_CHUOI]: "Chủ chuỗi",
  [Role.KE_TOAN_CHUOI]: "Kế toán chuỗi",
  [Role.QUAN_LY_CN]: "Quản lý CN",
  [Role.THU_NGAN]: "Thu ngân",
  [Role.THU_KHO]: "Thủ kho",
};

/**
 * Chain-wide roles: these users have implicit access to all branches
 * without needing UserBranch rows.
 */
export const CHAIN_WIDE_ROLES = new Set<Role>([
  Role.QUAN_TRI_HQ,
  Role.CHU_CHUOI,
  Role.KE_TOAN_CHUOI,
]);
