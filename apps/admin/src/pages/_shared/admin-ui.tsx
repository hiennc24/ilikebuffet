/**
 * admin-ui — small presentational helpers shared by the config screens
 * (ticket types, pricing, discounts).
 *
 * These are office-tier (non-touch) building blocks that sit on the design
 * tokens. The @ilikebuffet/ui DataTable was deferred (POS-first), so
 * these local helpers cover the admin CRUD tables without pulling a heavier
 * component into the shared library before the reporting wave needs it.
 */

import * as React from "react";
import { useIsCompact } from "../../lib/use-media-query";

// ── Card / section ────────────────────────────────────────────────────────────

export interface CardProps {
  title?: string;
  description?: string;
  /** Rendered on the right of the header (e.g. a "New" button). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, description, actions, children }) => {
  const compact = useIsCompact();
  return (
  <section
    style={{
      background: "var(--bg-raised, #FFFFFF)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)",
      display: "flex",
      flexDirection: "column",
    }}
  >
    {(title || actions) && (
      <header
        style={{
          display: "flex",
          alignItems: compact ? "stretch" : "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: compact ? "var(--space-2)" : "var(--space-4)",
          padding: compact ? "var(--space-3)" : "var(--space-4) var(--space-5)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {title && (
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-base)",
                fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
                color: "var(--text-primary)",
              }}
            >
              {title}
            </h2>
          )}
          {description && (
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
              }}
            >
              {description}
            </p>
          )}
        </div>
        {actions && <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>{actions}</div>}
      </header>
    )}
    <div style={{ padding: compact ? "var(--space-3)" : "var(--space-5)" }}>{children}</div>
  </section>
  );
};

// ── Table ──────────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. Return a string/number or a node. */
  render: (row: T) => React.ReactNode;
  /** Optional fixed width, e.g. "120px". */
  width?: string;
  align?: "left" | "right" | "center";
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Optional click handler for a whole row (e.g. open edit dialog). */
  onRowClick?: (row: T) => void;
  emptyText?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyText = "Chưa có dữ liệu.",
}: DataTableProps<T>) {
  const compact = useIsCompact();
  if (rows.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  // Phone: render each row as a label:value card instead of a wide table, so data
  // is readable without horizontal scrolling. The first column is the card title.
  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-1)",
              cursor: onRowClick ? "pointer" : "default",
              background: "var(--bg-raised, #FFFFFF)",
            }}
          >
            {columns.map((col, i) => (
              <div
                key={col.key}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  ...(i === 0
                    ? { fontSize: "var(--text-sm)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"], color: "var(--text-primary)", marginBottom: "2px" }
                    : { fontSize: "var(--text-xs)" }),
                }}
              >
                <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>{col.header}</span>
                <span style={{ color: "var(--text-primary)", textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{col.render(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    // Scrolls horizontally within the card on narrow screens (cells are nowrap),
    // so wide tables never break the page layout on mobile.
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", margin: "0 calc(-1 * var(--space-1))", padding: "0 var(--space-1)" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: col.align ?? "left",
                  padding: "var(--space-2) var(--space-3)",
                  borderBottom: "1px solid var(--border-default)",
                  color: "var(--text-muted)",
                  fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
                  fontSize: "var(--text-xs)",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                  width: col.width,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                cursor: onRowClick ? "pointer" : "default",
                transition: "background var(--dur-fast)",
              }}
              onMouseEnter={(e) => {
                if (onRowClick) e.currentTarget.style.background = "var(--bg-page, #FAF8F6)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    textAlign: col.align ?? "left",
                    padding: "var(--space-3)",
                    borderBottom: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────────

export interface SelectProps {
  id?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  "aria-label"?: string;
  /** Minimum width. Defaults to "auto". */
  minWidth?: string;
  /** Height. Defaults to touch-friendly "44px" (--input-height token). */
  height?: string;
  /** Border colour token. Defaults to `--border-default`. */
  borderColor?: string;
}

/**
 * Select — styled `<select>` on design tokens (touch-sized by default).
 * Replaces ~4 duplicated inline `<select>` blocks across the admin screens.
 */
export const Select: React.FC<SelectProps> = ({
  id,
  value,
  onChange,
  children,
  "aria-label": ariaLabel,
  minWidth = "auto",
  height = "var(--input-height, 44px)",
  borderColor = "var(--border-default)",
}) => (
  <select
    id={id}
    aria-label={ariaLabel}
    value={value}
    onChange={onChange}
    style={{
      height,
      padding: "0 var(--space-3)",
      border: `1px solid ${borderColor}`,
      borderRadius: "var(--radius-md)",
      background: "var(--bg-raised, #FFFFFF)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: "var(--text-primary)",
      cursor: "pointer",
      minWidth,
    }}
  >
    {children}
  </select>
);

export interface InlineErrorProps {
  message: string | null;
}

/**
 * InlineError — inline validation / server error message on design tokens.
 * Renders nothing when `message` is null/empty.
 * Replaces ~8 duplicated `<span role="alert">` blocks.
 */
export const InlineError: React.FC<InlineErrorProps> = ({ message }) => {
  if (!message) return null;
  return (
    <span
      role="alert"
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        color: "#C0392B",
      }}
    >
      {message}
    </span>
  );
};

// ── Badge ────────────────────────────────────────────────────────────────────

export type BadgeTone = "neutral" | "active" | "muted" | "warn";

const BADGE_TONES: Record<BadgeTone, { bg: string; color: string }> = {
  neutral: { bg: "var(--bg-page, #FAF8F6)", color: "var(--text-secondary)" },
  active: { bg: "var(--nav-active-bg, #EFF6F5)", color: "var(--action-bg, #235B54)" },
  muted: { bg: "var(--bg-sunken, #F1EDE7)", color: "var(--text-muted)" },
  warn: { bg: "#FBEDE9", color: "#B4472C" },
};

export const Badge: React.FC<{ tone?: BadgeTone; children: React.ReactNode }> = ({
  tone = "neutral",
  children,
}) => {
  const t = BADGE_TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "var(--radius-full, 999px)",
        background: t.bg,
        color: t.color,
        fontSize: "var(--text-xs)",
        fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
};

// ── Status helpers ──────────────────────────────────────────────────────────

export const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      padding: "var(--space-6)",
      textAlign: "center",
      color: "var(--text-muted)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
    }}
  >
    {text}
  </div>
);

export const LoadingState: React.FC<{ text?: string }> = ({ text = "Đang tải…" }) => (
  <div
    role="status"
    style={{
      padding: "var(--space-6)",
      textAlign: "center",
      color: "var(--text-muted)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
    }}
  >
    {text}
  </div>
);

export const ErrorState: React.FC<{ message: string }> = ({ message }) => (
  <div
    role="alert"
    style={{
      padding: "var(--space-5)",
      textAlign: "center",
      color: "#C0392B",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
    }}
  >
    {message}
  </div>
);

// ── Page layout ───────────────────────────────────────────────────────────────

/** Vertical stack for a page's cards, centered within the content area. */
export const PageStack: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-5)",
      width: "100%",
      maxWidth: "1200px",
      // Center the content column horizontally in the (wide, office-tier) main area.
      margin: "0 auto",
    }}
  >
    {children}
  </div>
);

// ── Filter bar ────────────────────────────────────────────────────────────────

/**
 * FilterBar — a horizontal row of filter controls (selects, search, date range)
 * with optional right-aligned actions. A thin layout wrapper so every list
 * screen arranges its filters the same way.
 */
export const FilterBar: React.FC<{ children: React.ReactNode; actions?: React.ReactNode }> = ({
  children,
  actions,
}) => (
  <div
    style={{
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "var(--space-3)",
      marginBottom: "var(--space-4)",
    }}
  >
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
      {children}
    </div>
    {actions && <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>{actions}</div>}
  </div>
);

// ── Pagination ──────────────────────────────────────────────────────────────

export interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** Pagination — prev/next + "Trang X/Y · N mục". 1-based page index. */
export const Pagination: React.FC<PaginationProps> = ({ page, pageCount, total, onPageChange }) => {
  const btn = (label: string, toPage: number, disabled: boolean) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => onPageChange(toPage)}
      style={{
        height: "var(--input-height, 44px)",
        minWidth: "44px",
        padding: "0 var(--space-3)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-raised, #FFFFFF)",
        color: disabled ? "var(--text-muted)" : "var(--text-primary)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        marginTop: "var(--space-4)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          color: "var(--text-muted)",
        }}
      >
        Trang {page}/{pageCount} · {total} mục
      </span>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        {btn("Trước", page - 1, page <= 1)}
        {btn("Sau", page + 1, page >= pageCount)}
      </div>
    </div>
  );
};

// ── Detail drawer ─────────────────────────────────────────────────────────────

export interface DetailDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Optional action row pinned to the drawer footer. */
  footer?: React.ReactNode;
}

/**
 * DetailDrawer — right-side slide-over panel for a row's detail (order, user,
 * audit event). Closes on backdrop click or Escape. Renders nothing when closed.
 */
export const DetailDrawer: React.FC<DetailDrawerProps> = ({ open, title, onClose, children, footer }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1300, display: "flex", justifyContent: "flex-end" }}>
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.32)" }}
      />
      <aside
        role="dialog"
        aria-label={title}
        style={{
          position: "relative",
          width: "min(480px, 100%)",
          height: "100%",
          background: "var(--bg-raised, #FFFFFF)",
          borderLeft: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-lg, -8px 0 24px rgba(0,0,0,0.12))",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            padding: "var(--space-4) var(--space-5)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-base)",
              fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              color: "var(--text-primary)",
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "var(--text-lg)",
              color: "var(--text-muted)",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-5)" }}>{children}</div>
        {footer && (
          <footer
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "var(--space-2)",
              padding: "var(--space-4) var(--space-5)",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
};

/**
 * Small helper to turn an unknown thrown value into a Vietnamese message.
 *
 * ApiError.message is the raw response body text. NestJS errors serialise as
 * JSON like {"statusCode":403,"message":"…","error":"Forbidden"} — so we parse
 * it and surface the inner `message`. Falls back to status code, then generic.
 */
export function toErrorMessage(err: unknown, fallback = "Đã xảy ra lỗi"): string {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    const raw = (err as { message?: string }).message;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { message?: string | string[] };
        if (parsed?.message) {
          return Array.isArray(parsed.message) ? parsed.message.join(", ") : parsed.message;
        }
      } catch {
        // Not JSON — fall through to the raw text if it looks human-readable.
        if (!raw.startsWith("<") && raw.length < 200) return raw;
      }
    }
    if (status) return `${fallback} (${status})`;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
