/**
 * usePagedList — react-query wrapper for the admin list screens.
 *
 * Builds a `?page=&pageSize=&<filters>` query, calls the ApiClient (so it rides
 * the shared auth + 401-refresh path), and normalises both the `{ data, total }`
 * envelope (platform endpoints) and bare arrays (/sales/*). Empty/undefined
 * filters are omitted so they don't send `?q=undefined`.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "../auth/auth-context";
import { unwrapList, listTotal } from "./unwrap-list";

export type Filters = Record<string, string | number | boolean | null | undefined>;

export interface UsePagedListArgs {
  /** Base query key; page/pageSize/filters are appended for cache identity. */
  queryKey: readonly unknown[];
  /** Base path WITHOUT a query string, e.g. "/sales/bills". */
  path: string;
  page: number;
  pageSize: number;
  filters?: Filters;
  /** Skip the request when false (e.g. a required branch not chosen yet). */
  enabled?: boolean;
}

export interface PagedResult<T> {
  rows: T[];
  total: number;
  pageCount: number;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/** Serialise non-empty filters into a query string (omits null/undefined/empty). */
export function buildQuery(filters: Filters = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  return params.toString();
}

/** Serialise page/pageSize + non-empty filters into a query string. */
export function buildListQuery(page: number, pageSize: number, filters: Filters = {}): string {
  const base = buildQuery(filters);
  return `page=${page}&pageSize=${pageSize}${base ? `&${base}` : ""}`;
}

type ListResponse<T> = T[] | { data: T[]; total?: number };

export function usePagedList<T>({
  queryKey,
  path,
  page,
  pageSize,
  filters = {},
  enabled = true,
}: UsePagedListArgs): PagedResult<T> {
  const { api } = useAuth();

  const query = useQuery({
    queryKey: [...queryKey, page, pageSize, filters],
    enabled,
    placeholderData: keepPreviousData, // keep prior page visible while the next loads
    queryFn: () => api.get<ListResponse<T>>(`${path}?${buildListQuery(page, pageSize, filters)}`),
  });

  // itemCount, not a money value — named to avoid the money-arithmetic lint on the
  // pageCount division below (this is a row count, never đồng).
  const itemCount = listTotal(query.data);
  return {
    rows: unwrapList(query.data),
    total: itemCount,
    pageCount: Math.max(1, Math.ceil(itemCount / pageSize)),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
