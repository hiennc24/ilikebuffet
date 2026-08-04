/**
 * data-table — main DataTable component wiring a react-table Table instance
 * to the styled primitives + mobile card fallback.
 *
 * Desktop: renders TableRoot → Table → THead/TBody with pinned-column support.
 * Mobile (useIsCompact): renders each row as a label:value card, matching the
 * pattern in admin-ui.tsx DataTable.
 * Loading: skeleton shimmer rows.
 * Empty / Error: delegates to admin-ui EmptyState / ErrorState.
 */

import * as React from "react";
import type { Table, RowData } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { useIsCompact } from "../../../lib/use-media-query";
import { EmptyState, ErrorState } from "../admin-ui";
import {
  TableRoot,
  Table as StyledTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "./table-primitives";

// ── Skeleton rows ─────────────────────────────────────────────────────────────

function SkeletonRow({ colCount }: { colCount: number }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i} style={{ padding: "var(--space-3)" }}>
          <div
            style={{
              height: "14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-sunken)",
              // Vary widths slightly so it looks natural.
              width: i === 0 ? "60%" : i % 3 === 0 ? "40%" : "80%",
              animation: "shimmer 1.4s ease-in-out infinite",
            }}
          />
        </td>
      ))}
    </tr>
  );
}

// Shimmer keyframe injected once into the document head.
const SHIMMER_STYLE_ID = "ibb-table-shimmer";
function ensureShimmerStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(SHIMMER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SHIMMER_STYLE_ID;
  style.textContent = `
    @keyframes shimmer {
      0%   { opacity: 1; }
      50%  { opacity: 0.4; }
      100% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// ── DataTable ─────────────────────────────────────────────────────────────────

export interface DataTableProps<TData extends RowData> {
  /** react-table Table instance, created via useDataTable. */
  table: Table<TData>;
  /** Show skeleton loading rows instead of data rows. */
  isLoading?: boolean;
  /** Show an error banner instead of the table. */
  isError?: boolean;
  /** Called when a data row is clicked. Enables row cursor + keyboard activation. */
  onRowClick?: (row: TData) => void;
  /**
   * Toolbar rendered above the table when no rows are selected.
   * Typically contains search / filter controls.
   */
  toolbar?: React.ReactNode;
  /**
   * Selection action bar rendered above the table when ≥1 row is selected.
   * Replaces toolbar while rows are selected.
   */
  selectionBar?: React.ReactNode;
  /** Node to render when there are no rows and not loading. */
  empty?: React.ReactNode;
  /** Constrain table body to this CSS height and scroll vertically. */
  scrollY?: string | number;
}

export function DataTable<TData extends RowData>({
  table,
  isLoading = false,
  isError = false,
  onRowClick,
  toolbar,
  selectionBar,
  empty,
  scrollY,
}: DataTableProps<TData>) {
  React.useEffect(() => {
    ensureShimmerStyle();
  }, []);

  const compact = useIsCompact();
  const rows = table.getRowModel().rows;
  const headerGroups = table.getHeaderGroups();
  const allColumns = table.getVisibleLeafColumns();
  const pageSize = table.getState().pagination.pageSize;
  const skeletonCount = Math.min(pageSize, 8);
  const colCount = allColumns.length;

  const selectedCount = table.getSelectedRowModel().rows.length;
  const hasSelection = selectedCount > 0;

  // Error state — short-circuits everything.
  if (isError) {
    return <ErrorState message="Đã xảy ra lỗi khi tải dữ liệu." />;
  }

  // ── Mobile card layout ──────────────────────────────────────────────────────
  if (compact) {
    // Columns to display in card mode — skip select/actions system columns.
    const cardColumns = allColumns.filter(
      (col) => col.id !== "select" && col.id !== "actions",
    );

    if (isLoading) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div
              key={i}
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3)",
                background: "var(--bg-raised)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
              }}
            >
              {[70, 50, 90].map((w, j) => (
                <div
                  key={j}
                  style={{
                    height: "12px",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-sunken)",
                    width: `${w}%`,
                    animation: "shimmer 1.4s ease-in-out infinite",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      );
    }

    if (rows.length === 0) {
      return empty ? <>{empty}</> : <EmptyState text="Chưa có dữ liệu." />;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {rows.map((row) => {
          const [firstCol, ...restCols] = cardColumns;
          return (
            <div
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
                cursor: onRowClick ? "pointer" : "default",
                background: row.getIsSelected() ? "var(--nav-active-bg)" : "var(--bg-raised)",
                transition: "background var(--dur-fast)",
              }}
            >
              {/* First column is the card title */}
              {firstCol && (() => {
                const firstCell = row.getVisibleCells().find((c) => c.column.id === firstCol.id);
                if (!firstCell) return null;
                return (
                  <div
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-sans)",
                      marginBottom: "2px",
                    }}
                  >
                    {flexRender(firstCell.column.columnDef.cell, firstCell.getContext())}
                  </div>
                );
              })()}
              {/* Remaining columns as label:value rows */}
              {restCols.map((col) => {
                const cell = row.getVisibleCells().find((c) => c.column.id === col.id);
                if (!cell) return null;
                const label =
                  (col.columnDef.meta as { headerLabel?: string } | undefined)?.headerLabel ??
                  (typeof col.columnDef.header === "string" ? col.columnDef.header : col.id);
                return (
                  <div
                    key={col.id}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: "var(--space-3)",
                      fontSize: "var(--text-xs)",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {label}
                    </span>
                    <span style={{ color: "var(--text-primary)", textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Desktop table layout ────────────────────────────────────────────────────
  return (
    <div>
      {/* Toolbar / selection bar slot */}
      {(toolbar || selectionBar) && (
        <div style={{ marginBottom: "var(--space-3)" }}>
          {hasSelection && selectionBar ? selectionBar : toolbar}
        </div>
      )}

      <TableRoot scrollY={scrollY}>
        <StyledTable>
          <THead>
            {headerGroups.map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  return (
                    <TH
                      key={header.id}
                      align={meta?.align ?? "left"}
                      width={meta?.width}
                      pinnedLeft={meta?.pinnedLeft}
                      pinnedRight={meta?.pinnedRight}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TH>
                  );
                })}
              </tr>
            ))}
          </THead>

          <TBody>
            {isLoading ? (
              Array.from({ length: skeletonCount }).map((_, i) => (
                <SkeletonRow key={i} colCount={colCount} />
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount}>
                  {empty ?? <EmptyState text="Chưa có dữ liệu." />}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isSelected = row.getIsSelected();
                const rowBg = isSelected ? "var(--nav-active-bg)" : "var(--bg-raised)";

                return (
                  <TR
                    key={row.id}
                    selected={isSelected}
                    clickable={!!onRowClick}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick(row.original);
                            }
                          }
                        : undefined
                    }
                    role={onRowClick ? "button" : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-selected={isSelected || undefined}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <TD
                          key={cell.id}
                          align={meta?.align ?? "left"}
                          pinnedLeft={meta?.pinnedLeft}
                          pinnedRight={meta?.pinnedRight}
                          rowBg={rowBg}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TD>
                      );
                    })}
                  </TR>
                );
              })
            )}
          </TBody>
        </StyledTable>
      </TableRoot>
    </div>
  );
}
