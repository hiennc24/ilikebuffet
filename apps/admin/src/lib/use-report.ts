/**
 * useReport — react-query wrapper for read-only report GETs.
 *
 * Report endpoints return a computed object (totals + rows), not a paginated
 * list, so this is thinner than usePagedList. Empty/undefined params are omitted.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "../auth/auth-context";
import type { Filters } from "./use-paged-list";
import { buildQuery } from "./use-paged-list";

export interface UseReportArgs {
  queryKey: readonly unknown[];
  path: string;
  params?: Filters;
  enabled?: boolean;
}

export function useReport<T>({ queryKey, path, params = {}, enabled = true }: UseReportArgs) {
  const { api } = useAuth();
  const query = useQuery({
    queryKey: [...queryKey, params],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => {
      const qs = buildQuery(params);
      return api.get<T>(`${path}${qs ? `?${qs}` : ""}`);
    },
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
