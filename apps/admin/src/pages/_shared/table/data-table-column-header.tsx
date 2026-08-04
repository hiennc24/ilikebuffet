/**
 * data-table-column-header — sortable column header button.
 *
 * Renders a sort toggle button when the column is sortable, or plain text
 * otherwise. Indicator arrows: ↑ asc / ↓ desc / ↕ unsorted (muted).
 * aria-sort is forwarded to the parent <th> via the TH primitive.
 */

import * as React from "react";
import type { Column } from "@tanstack/react-table";

export interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  align?: "left" | "right" | "center";
}

/** Sort direction indicator shown inline after the column title. */
function SortIcon({ direction }: { direction: "asc" | "desc" | false }) {
  if (direction === "asc") {
    return (
      <span aria-hidden="true" style={{ marginLeft: "4px", fontSize: "0.75em" }}>
        ↑
      </span>
    );
  }
  if (direction === "desc") {
    return (
      <span aria-hidden="true" style={{ marginLeft: "4px", fontSize: "0.75em" }}>
        ↓
      </span>
    );
  }
  // Unsorted — muted bidirectional indicator.
  return (
    <span
      aria-hidden="true"
      style={{
        marginLeft: "4px",
        fontSize: "0.75em",
        color: "var(--text-muted)",
        opacity: 0.6,
      }}
    >
      ↕
    </span>
  );
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  align = "left",
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-2xs)",
          fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {title}
      </span>
    );
  }

  const sorted = column.getIsSorted(); // "asc" | "desc" | false

  const ariaSort =
    sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";

  return (
    <button
      type="button"
      aria-sort={ariaSort}
      onClick={() => column.toggleSorting(sorted === "asc")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
        gap: 0,
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-2xs)",
        fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
        color: sorted ? "var(--text-primary)" : "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
        transition: "color var(--dur-fast)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = sorted ? "var(--text-primary)" : "var(--text-muted)";
      }}
    >
      {title}
      <SortIcon direction={sorted} />
    </button>
  );
}
