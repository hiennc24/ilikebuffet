/**
 * use-data-table — memoized react-table instance for server-driven tables.
 *
 * Bridges our 1-indexed page / "field.asc"|"field.desc"|null sort contract
 * to react-table's 0-indexed pagination and SortingState internally.
 *
 * Callers supply:
 *   page      — 1-based current page (controlled)
 *   limit     — rows per page (controlled)
 *   sort      — "field.asc" | "field.desc" | null (controlled)
 *   setPage   — setter (receives 1-based value)
 *   setLimit  — setter
 *   setSort   — setter
 *   total     — total record count from the server
 *
 * The returned Table instance is passed directly to <DataTable table={...} />.
 */

import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type PaginationState,
  type RowData,
} from "@tanstack/react-table";

// ── Sort string helpers ───────────────────────────────────────────────────────

/**
 * Convert our sort string ("field.asc" | "field.desc" | null)
 * into react-table SortingState.
 */
export function parseSortString(sort: string | null): SortingState {
  if (!sort) return [];
  const lastDot = sort.lastIndexOf(".");
  if (lastDot === -1) return [];
  const id = sort.slice(0, lastDot);
  const dir = sort.slice(lastDot + 1);
  if (dir !== "asc" && dir !== "desc") return [];
  return [{ id, desc: dir === "desc" }];
}

/**
 * Convert react-table SortingState back to our sort string.
 * Uses only the first sort entry (single-column sort).
 */
export function buildSortString(sorting: SortingState): string | null {
  if (sorting.length === 0) return null;
  const { id, desc } = sorting[0];
  return `${id}.${desc ? "desc" : "asc"}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseDataTableOptions<TData extends RowData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  /** Total record count from the server (for pageCount calculation). */
  total: number;
  /** Current 1-based page number. */
  page: number;
  /** Rows per page. */
  limit: number;
  /** Active sort: "field.asc" | "field.desc" | null. */
  sort: string | null;
  /** Called with a 1-based page number. */
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  /** Called with "field.asc" | "field.desc" | null. */
  setSort: (sort: string | null) => void;
  /** Returns a stable string key for a row (used as react key + selection id). */
  getRowId?: (row: TData) => string;
  /** Enable row selection checkboxes. Defaults to false. */
  enableRowSelection?: boolean;
}

export function useDataTable<TData extends RowData>({
  data,
  columns,
  total,
  page,
  limit,
  sort,
  setPage,
  setLimit,
  setSort,
  getRowId,
  enableRowSelection = false,
}: UseDataTableOptions<TData>) {
  // react-table uses 0-based pagination internally.
  const pagination = React.useMemo<PaginationState>(
    () => ({ pageIndex: page - 1, pageSize: limit }),
    [page, limit],
  );

  const sorting = React.useMemo<SortingState>(() => parseSortString(sort), [sort]);

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  // Guard against limit === 0 (would yield Infinity); matches usePagedList.
  const pageCount = limit > 0 ? Math.ceil(total / limit) : 0;

  const table = useReactTable<TData>({
    data,
    columns,
    pageCount,
    state: {
      pagination,
      sorting,
      rowSelection,
    },
    // Server-driven — react-table does not filter/sort/page the data locally.
    manualPagination: true,
    manualSorting: true,
    enableRowSelection,
    getRowId,
    getCoreRowModel: getCoreRowModel(),

    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(pagination) : updater;
      if (next.pageSize !== limit) {
        setLimit(next.pageSize);
        // Reset to page 1 when page size changes.
        setPage(1);
      } else {
        // react-table gives 0-based index; callers want 1-based.
        setPage(next.pageIndex + 1);
      }
    },

    onSortingChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(sorting) : updater;
      setSort(buildSortString(next));
      // Reset to first page on sort change.
      setPage(1);
    },

    onRowSelectionChange: setRowSelection,
  });

  return table;
}
