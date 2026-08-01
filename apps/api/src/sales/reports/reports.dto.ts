/** Query DTOs for reporting endpoints. All read-only. */

export interface RevenueQuery {
  from?: string;
  to?: string;
  branchId?: string;
  groupBy?: "day" | "branch" | "shift";
}
