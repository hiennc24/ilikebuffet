/**
 * data-table-pagination — pagination bar for the DataTable layer.
 *
 * Left: page-size selector "Hiển thị [select] / {total}".
 * Right: prev + numbered page buttons (max 7 visible, ellipsis when more) + next.
 * Active page uses --action-bg (brand green). Vietnamese labels throughout.
 * Wraps gracefully on narrow viewports.
 */

import * as React from "react";
import type { Table, RowData } from "@tanstack/react-table";

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

export interface DataTablePaginationProps<TData extends RowData> {
  table: Table<TData>;
  /** Total record count (for the "/ N" display). */
  total: number;
  /** Page-size options shown in the select. Defaults to [10, 20, 30, 50]. */
  pageSizeOptions?: number[];
}

// ── Page-number window ────────────────────────────────────────────────────────

/**
 * Returns the sequence of page numbers (1-based) and "…" ellipsis markers
 * to render, capped at 7 visible slots.
 *
 * Examples (current / total):
 *   1/10  → [1, 2, 3, "…", 8, 9, 10]   — wait, that is 7 — correct
 *   5/10  → [1, "…", 4, 5, 6, "…", 10]
 *   9/10  → [1, 2, 3, "…", 8, 9, 10]
 */
function buildPageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "…")[] = [];

  // Always show first and last page.
  // Show a window of 3 around the current page.
  const WING = 1; // pages on each side of current

  const showLeft = current - WING;  // first page of middle window
  const showRight = current + WING; // last page of middle window

  pages.push(1);

  if (showLeft > 2) {
    pages.push("…");
  } else {
    // Fill in pages 2..showLeft if the gap is small.
    for (let p = 2; p < showLeft; p++) pages.push(p);
  }

  for (let p = Math.max(2, showLeft); p <= Math.min(total - 1, showRight); p++) {
    pages.push(p);
  }

  if (showRight < total - 1) {
    pages.push("…");
  } else {
    for (let p = showRight + 1; p < total; p++) pages.push(p);
  }

  pages.push(total);

  return pages;
}

// ── Button helpers ────────────────────────────────────────────────────────────

function PageButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      style={{
        minWidth: "32px",
        height: "32px",
        padding: "0 var(--space-2)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid",
        borderColor: active ? "var(--action-bg)" : "var(--border-default)",
        borderRadius: "var(--radius-md)",
        background: active ? "var(--action-bg)" : "var(--bg-raised)",
        color: active ? "var(--action-text)" : disabled ? "var(--text-muted)" : "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        fontWeight: active
          ? ("var(--fw-medium)" as React.CSSProperties["fontWeight"])
          : undefined,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled && !active ? 0.5 : 1,
        transition: "background var(--dur-fast), border-color var(--dur-fast)",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

export function DataTablePagination<TData extends RowData>({
  table,
  total,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination;
  // react-table is 0-indexed; display is 1-indexed.
  const currentPage = pageIndex + 1;
  const pageCount = table.getPageCount();

  const pageWindow = buildPageWindow(currentPage, pageCount);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        marginTop: "var(--space-3)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Left: page-size selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          fontSize: "var(--text-sm)",
          color: "var(--text-secondary)",
          flexWrap: "wrap",
        }}
      >
        <span>Hiển thị</span>
        <select
          aria-label="Số hàng mỗi trang"
          value={pageSize}
          onChange={(e) => {
            table.setPageSize(Number(e.target.value));
          }}
          style={{
            height: "32px",
            padding: "0 var(--space-2)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-raised)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span>
          / <strong style={{ color: "var(--text-primary)" }}>{total}</strong> bản ghi
        </span>
      </div>

      {/* Right: page buttons */}
      {pageCount > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", flexWrap: "wrap" }}>
          {/* Prev */}
          <PageButton
            label="Trang trước"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            ‹
          </PageButton>

          {/* Page numbers + ellipsis */}
          {pageWindow.map((p, idx) =>
            p === "…" ? (
              <span
                key={`ellipsis-${idx}`}
                style={{
                  minWidth: "32px",
                  height: "32px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--text-sm)",
                  color: "var(--text-muted)",
                  userSelect: "none",
                }}
              >
                …
              </span>
            ) : (
              <PageButton
                key={p}
                label={`Trang ${p}`}
                active={p === currentPage}
                onClick={() => table.setPageIndex((p as number) - 1)}
              >
                {p}
              </PageButton>
            ),
          )}

          {/* Next */}
          <PageButton
            label="Trang sau"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            ›
          </PageButton>
        </div>
      )}
    </div>
  );
}
