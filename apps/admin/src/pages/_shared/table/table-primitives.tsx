/**
 * table-primitives — styled HTML table building blocks on design tokens.
 *
 * All sizing, colour, and spacing comes from CSS custom properties defined in
 * packages/ui/src/tokens/tokens.css. No raw hex values except where a semantic
 * token genuinely does not exist (e.g. z-index integers).
 */

import * as React from "react";

// ── Container ─────────────────────────────────────────────────────────────────

export interface TableRootProps {
  children: React.ReactNode;
  /** When set, the table body scrolls vertically within this max height. */
  scrollY?: string | number;
  style?: React.CSSProperties;
}

/** Outer scroll wrapper. Handles horizontal overflow on narrow screens. */
export const TableRoot: React.FC<TableRootProps> = ({ children, scrollY, style }) => (
  <div
    style={{
      overflowX: "auto",
      overflowY: scrollY ? "auto" : undefined,
      maxHeight: scrollY ? (typeof scrollY === "number" ? `${scrollY}px` : scrollY) : undefined,
      WebkitOverflowScrolling: "touch",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border-subtle)",
      ...style,
    }}
  >
    {children}
  </div>
);

// ── Table ─────────────────────────────────────────────────────────────────────

export const Table: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <table
    style={{
      width: "100%",
      borderCollapse: "collapse",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: "var(--text-primary)",
      ...style,
    }}
  >
    {children}
  </table>
);

// ── THead ─────────────────────────────────────────────────────────────────────

export const THead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <thead
    style={{
      position: "sticky",
      top: 0,
      // Must sit above pinned body cells (z-index 1) so header stays on top.
      zIndex: 2,
      // Cool near-white surface matching the DTV reference header row.
      background: "var(--bg-surface, var(--nav-active-bg))",
    }}
  >
    {children}
  </thead>
);

// ── TBody ─────────────────────────────────────────────────────────────────────

export const TBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody>{children}</tbody>
);

// ── TR ────────────────────────────────────────────────────────────────────────

export interface TRProps {
  children: React.ReactNode;
  selected?: boolean;
  clickable?: boolean;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTableRowElement>) => void;
  style?: React.CSSProperties;
  role?: string;
  tabIndex?: number;
  "aria-selected"?: boolean;
}

export const TR: React.FC<TRProps> = ({
  children,
  selected,
  clickable,
  onClick,
  onKeyDown,
  style,
  role,
  tabIndex,
  "aria-selected": ariaSelected,
}) => {
  const [hovered, setHovered] = React.useState(false);

  const bgColor = selected
    ? "var(--nav-active-bg)"
    : hovered && clickable
      ? "var(--bg-page)"
      : "transparent";

  return (
    <tr
      role={role}
      tabIndex={tabIndex}
      aria-selected={ariaSelected}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        background: bgColor,
        transition: "background var(--dur-fast)",
        cursor: clickable ? "pointer" : "default",
        outline: "none",
        ...style,
      }}
    >
      {children}
    </tr>
  );
};

// ── TH ────────────────────────────────────────────────────────────────────────

export interface THProps {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  pinnedLeft?: boolean;
  pinnedRight?: boolean;
  /** aria-sort value for sortable headers. */
  "aria-sort"?: "ascending" | "descending" | "none" | "other";
  style?: React.CSSProperties;
}

export const TH: React.FC<THProps> = ({
  children,
  align = "left",
  width,
  pinnedLeft,
  pinnedRight,
  "aria-sort": ariaSort,
  style,
}) => (
  <th
    aria-sort={ariaSort}
    style={{
      textAlign: align,
      padding: "var(--space-2) var(--space-3)",
      height: "40px",
      color: "var(--text-secondary)",
      fontFamily: "var(--font-sans)",
      fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
      fontSize: "var(--text-2xs)",
      textTransform: "uppercase",
      letterSpacing: "0.03em",
      whiteSpace: "nowrap",
      verticalAlign: "middle",
      width,
      // Pinned header column — must share the thead's mint tint so content
      // scrolling beneath does not bleed through (no seam).
      ...(pinnedLeft && {
        position: "sticky",
        left: 0,
        zIndex: 1,
        background: "var(--bg-surface, var(--nav-active-bg))",
      }),
      ...(pinnedRight && {
        position: "sticky",
        right: 0,
        zIndex: 1,
        background: "var(--bg-surface, var(--nav-active-bg))",
      }),
      ...style,
    }}
  >
    {children}
  </th>
);

// ── TD ────────────────────────────────────────────────────────────────────────

export interface TDProps {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  pinnedLeft?: boolean;
  pinnedRight?: boolean;
  /** Background passed down from the parent row (selected / hover) so pinned
   *  cells match the row colour instead of letting content show through. */
  rowBg?: string;
  style?: React.CSSProperties;
}

export const TD: React.FC<TDProps> = ({
  children,
  align = "left",
  pinnedLeft,
  pinnedRight,
  rowBg,
  style,
}) => (
  <td
    style={{
      textAlign: align,
      padding: "var(--space-3)",
      verticalAlign: "middle",
      color: "var(--text-primary)",
      fontSize: "var(--text-sm)",
      fontFamily: "var(--font-sans)",
      whiteSpace: "nowrap",
      ...(pinnedLeft && {
        position: "sticky",
        left: 0,
        zIndex: 1,
        // Inherit the current row background so scrolled content is hidden.
        background: rowBg ?? "var(--bg-raised)",
      }),
      ...(pinnedRight && {
        position: "sticky",
        right: 0,
        zIndex: 1,
        background: rowBg ?? "var(--bg-raised)",
      }),
      ...style,
    }}
  >
    {children}
  </td>
);
