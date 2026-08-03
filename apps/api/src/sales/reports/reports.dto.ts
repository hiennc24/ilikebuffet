/** Query DTOs for reporting endpoints. All read-only. */

export interface RevenueQuery {
  from?: string;
  to?: string;
  branchId?: string;
  groupBy?: "day" | "branch" | "shift";
}

export interface GrossMarginQuery {
  from?: string;
  to?: string;
  branchId?: string;
  groupBy?: "day" | "branch";
}

export interface ShiftCashQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

export interface QuarantineQuery {
  from?: string;
  to?: string;
  branchId?: string;
  /** "true"/"false" to filter by resolved state. */
  resolved?: string;
  page?: string;
  pageSize?: string;
}

export interface ResolveQuarantineDto {
  note?: string;
}
