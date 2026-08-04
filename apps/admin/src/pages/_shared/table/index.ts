/**
 * Public surface of the DataTable layer.
 * Import from "../_shared/table" in page files.
 */

// Core table component + hook
export { DataTable } from "./data-table";
export type { DataTableProps } from "./data-table";
export { useDataTable, parseSortString, buildSortString } from "./use-data-table";
export type { UseDataTableOptions } from "./use-data-table";

// Pagination
export { DataTablePagination } from "./data-table-pagination";
export type { DataTablePaginationProps } from "./data-table-pagination";

// Column factories
export { createSelectionColumn, createActionsColumn } from "./column-helpers";
export type { ActionMenuItem, ActionTone, CreateActionsColumnOptions } from "./column-helpers";

// Cell helpers
export { Badge, Avatar, MutedCell } from "./data-table-cells";
export type { BadgeProps, BadgeTone, AvatarProps, MutedCellProps } from "./data-table-cells";

// Sortable column header
export { DataTableColumnHeader } from "./data-table-column-header";
export type { DataTableColumnHeaderProps } from "./data-table-column-header";

// Low-level primitives (for custom table layouts)
export { TableRoot, Table, THead, TBody, TR, TH, TD } from "./table-primitives";
export type { TableRootProps, TRProps, THProps, TDProps } from "./table-primitives";
