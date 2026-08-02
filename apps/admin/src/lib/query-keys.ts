/**
 * query-keys — centralized React Query key factories for the admin SPA.
 *
 * Keeping keys here prevents typo-driven coupling where editing a ticket type
 * accidentally invalidates the pricing matrix (both referenced ["ticket-types"]
 * as a raw literal). Consumers import from here instead of writing inline arrays.
 *
 * Scoping rule:
 *   - Keys with a dynamic segment (e.g. versionId) are factory functions.
 *   - Keys that are list-level share a common root so invalidateQueries on the
 *     root busts all related sub-keys without over-invalidating unrelated views.
 */

export const QUERY_KEYS = {
  /** All open shifts for a branch. Polled on the shift monitor page. */
  openShifts: (branchId: string | null) => ["open-shifts", branchId] as const,

  /** Live summary for a single shift. Polled on the shift monitor page. */
  shiftSummary: (shiftId: string | null) => ["shift-summary", shiftId] as const,

  /** Master list of ticket types. Mutated by ticket-types-page. */
  ticketTypes: () => ["ticket-types"] as const,

  /** Master list of time windows. Mutated by pricing-page (TimeWindowCard). */
  timeWindows: () => ["time-windows"] as const,

  /** List of all price-book versions. */
  pricingVersions: () => ["pricing-versions"] as const,

  /** A single price-book version with its cells. */
  pricingVersion: (versionId: string) => ["pricing-version", versionId] as const,

  /** Discount programs list. */
  discountPrograms: () => ["discount-programs"] as const,

  /** Discount reasons list. */
  discountReasons: () => ["discount-reasons"] as const,

  /** Orders (bills) list root — filters/page appended by usePagedList. */
  orders: () => ["orders"] as const,

  /** A single bill's detail (lines, payments, refunds). */
  order: (id: string) => ["order", id] as const,

  /** Branches list (search/status appended by the page). */
  branches: () => ["branches"] as const,

  /** Suppliers list (scope/status/search appended by the page). */
  suppliers: () => ["suppliers"] as const,

  /** Users list (role/status/search + page appended by usePagedList). */
  users: () => ["users"] as const,

  /** Audit log list (filters + page appended by usePagedList). */
  audit: () => ["audit"] as const,

  /** Devices list (branch filter appended by the page). */
  devices: () => ["devices"] as const,

  /** Holiday calendars (with entries). */
  holidays: () => ["holiday-calendars"] as const,

  /** Ingredient units (code/name). */
  units: () => ["units"] as const,
  /** Ingredient groups. */
  ingredientGroups: () => ["ingredient-groups"] as const,
  /** Ingredients list (filters + page appended by usePagedList). */
  ingredients: () => ["ingredients"] as const,

  /** Accounting accounts + groups. */
  accounts: () => ["accounts"] as const,
  accountGroups: () => ["account-groups"] as const,

  /** Purchase orders list (filters + page appended by usePagedList). */
  purchaseOrders: () => ["purchase-orders"] as const,
  /** A single purchase order with its lines. */
  purchaseOrder: (id: string) => ["purchase-order", id] as const,

  /** Reports (params appended by useReport). */
  revenueReport: () => ["report-revenue"] as const,
  shiftCashReport: () => ["report-shift-cash"] as const,
  quarantineReport: () => ["report-quarantine"] as const,
  numberGapsReport: () => ["report-number-gaps"] as const,
  dashboardReport: () => ["report-dashboard"] as const,
} as const;
