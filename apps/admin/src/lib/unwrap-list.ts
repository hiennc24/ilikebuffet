/**
 * Normalise a list response. Platform list endpoints (branches, master data,
 * orders, users, audit) use a paginated `{ data, total }` envelope, while
 * /sales/* return bare arrays. Accept either shape so callers don't care which
 * convention an endpoint uses.
 */
export function unwrapList<T>(res: T[] | { data: T[] } | null | undefined): T[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray((res as { data?: T[] }).data)) return (res as { data: T[] }).data;
  return [];
}

/** Read the total count from a paginated envelope, falling back to the row count. */
export function listTotal<T>(res: T[] | { data: T[]; total?: number } | null | undefined): number {
  if (res && !Array.isArray(res) && typeof (res as { total?: number }).total === "number") {
    return (res as { total: number }).total;
  }
  return unwrapList(res).length;
}
