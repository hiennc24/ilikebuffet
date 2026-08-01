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

// ── Card / section ────────────────────────────────────────────────────────────

export interface CardProps {
  title?: string;
  description?: string;
  /** Rendered on the right of the header (e.g. a "New" button). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, description, actions, children }) => (
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
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          padding: "var(--space-4) var(--space-5)",
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
        {actions && <div style={{ display: "flex", gap: "var(--space-2)" }}>{actions}</div>}
      </header>
    )}
    <div style={{ padding: "var(--space-5)" }}>{children}</div>
  </section>
);

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
  if (rows.length === 0) {
    return <EmptyState text={emptyText} />;
  }
  return (
    <div style={{ overflowX: "auto" }}>
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
}) => (
  <select
    id={id}
    aria-label={ariaLabel}
    value={value}
    onChange={onChange}
    style={{
      height,
      padding: "0 var(--space-3)",
      border: "1px solid var(--border-default)",
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
