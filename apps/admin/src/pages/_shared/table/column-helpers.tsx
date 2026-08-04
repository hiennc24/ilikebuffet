/**
 * column-helpers — factory functions for the two universal column types.
 *
 * createSelectionColumn  — checkbox column pinned left.
 * createActionsColumn    — "…" menu column pinned right, self-contained dropdown
 *                          using the same outside-click + Esc pattern as admin-shell.tsx.
 */

import * as React from "react";
import type { ColumnDef, Row } from "@tanstack/react-table";

// ── Selection column ──────────────────────────────────────────────────────────

/** Creates a selection checkbox column pinned to the left edge. */
export function createSelectionColumn<T>(): ColumnDef<T> {
  return {
    id: "select",
    enableSorting: false,
    meta: {
      pinnedLeft: true,
      width: "40px",
      headerLabel: "",
    },
    header: ({ table }) => {
      const allSelected = table.getIsAllPageRowsSelected();
      const someSelected = table.getIsSomePageRowsSelected();
      return (
        <input
          type="checkbox"
          aria-label="Chọn tất cả"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected && !allSelected;
          }}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          style={{ cursor: "pointer", accentColor: "var(--action-bg)" }}
        />
      );
    },
    cell: ({ row }) => (
      <input
        type="checkbox"
        aria-label="Chọn hàng"
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onChange={row.getToggleSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: "pointer", accentColor: "var(--action-bg)" }}
      />
    ),
  };
}

// ── Actions column ─────────────────────────────────────────────────────────────

export type ActionTone = "default" | "danger";

export interface ActionMenuItem<T> {
  key: string;
  label: string;
  /** Optional SVG path data (18×18 viewBox 0 0 24 24). */
  icon?: string;
  tone?: ActionTone;
  /** Return true to hide this item for a given row. */
  hidden?: (row: T) => boolean;
  /** Return true to disable this item for a given row. */
  disabled?: (row: T) => boolean;
  onSelect: (row: T) => void;
}

export interface CreateActionsColumnOptions<T> {
  menu: ActionMenuItem<T>[];
}

/** Dots-icon button that opens the actions menu for a row. Self-contained. */
function ActionsCell<T>({
  row,
  menu,
}: {
  row: Row<T>;
  menu: ActionMenuItem<T>[];
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Focusable (enabled) menu items, in DOM order.
  const menuItems = React.useCallback(
    () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []),
    [],
  );

  // Move focus into the menu when it opens (keyboard operability).
  React.useEffect(() => {
    if (open) menuItems()[0]?.focus();
  }, [open, menuItems]);

  // Roving focus with Arrow/Home/End while the menu is open.
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = menuItems();
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  // Close on outside click — same pattern as admin-shell.tsx dropdowns.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape — same pattern as admin-shell.tsx dropdowns.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const visibleItems = menu.filter((item) => !item.hidden?.(row.original));

  return (
    <div
      ref={ref}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
    >
      <button
        type="button"
        aria-label="Thao tác"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          width: "28px",
          height: "28px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "1px solid transparent",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-base)",
          lineHeight: 1,
          transition: "background var(--dur-fast), border-color var(--dur-fast)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-surface)";
          e.currentTarget.style.borderColor = "var(--border-subtle)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.borderColor = "transparent";
        }}
      >
        {/* Three-dots (ellipsis) icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {open && visibleItems.length > 0 && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Thao tác hàng"
          onKeyDown={onMenuKeyDown}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: "160px",
            background: "var(--bg-raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-md)",
            zIndex: 300,
            overflow: "hidden",
            padding: "var(--space-1)",
          }}
        >
          {visibleItems.map((item) => {
            const isDisabled = item.disabled?.(row.original) ?? false;
            const isDanger = item.tone === "danger";
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={isDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect(row.original);
                }}
                style={{
                  width: "100%",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "0 var(--space-3)",
                  background: "transparent",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  opacity: isDisabled ? 0.5 : 1,
                  color: isDanger ? "var(--status-danger-text)" : "var(--text-primary)",
                  fontSize: "var(--text-sm)",
                  fontFamily: "var(--font-sans)",
                  textAlign: "left",
                  whiteSpace: "nowrap",
                  transition: "background var(--dur-fast)",
                }}
                onMouseEnter={(e) => {
                  if (!isDisabled)
                    e.currentTarget.style.background = isDanger
                      ? "var(--status-danger-bg)"
                      : "var(--bg-page)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {item.icon && (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={item.icon} />
                  </svg>
                )}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Creates an actions "…" column pinned to the right edge. */
export function createActionsColumn<T>({
  menu,
}: CreateActionsColumnOptions<T>): ColumnDef<T> {
  return {
    id: "actions",
    enableSorting: false,
    meta: {
      pinnedRight: true,
      width: "48px",
      headerLabel: "",
      align: "right",
    },
    header: () => null,
    cell: ({ row }) => <ActionsCell row={row} menu={menu} />,
  };
}
