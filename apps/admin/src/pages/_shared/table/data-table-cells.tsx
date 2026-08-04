/**
 * data-table-cells — presentational cell helpers for the DataTable layer.
 *
 * Badge uses the --status-* tokens added to tokens.css (neutral/success/warn/danger/info).
 * Avatar falls back to initials on --nav-active-bg/color when no image src is given.
 * MutedCell is a tiny wrapper for secondary text that needs de-emphasis.
 */

import * as React from "react";

// ── Badge ─────────────────────────────────────────────────────────────────────

export type BadgeTone = "neutral" | "success" | "warn" | "danger" | "info";

const TONE_VARS: Record<BadgeTone, { bg: string; text: string }> = {
  neutral: {
    bg: "var(--status-neutral-bg)",
    text: "var(--status-neutral-text)",
  },
  success: {
    bg: "var(--status-success-bg)",
    text: "var(--status-success-text)",
  },
  warn: {
    bg: "var(--status-warn-bg)",
    text: "var(--status-warn-text)",
  },
  danger: {
    bg: "var(--status-danger-bg)",
    text: "var(--status-danger-text)",
  },
  info: {
    bg: "var(--status-info-bg)",
    text: "var(--status-info-text)",
  },
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** When true, renders a small leading ● dot in the tone's text colour. */
  dot?: boolean;
  children: React.ReactNode;
}

/** Status badge pill with warm brand status tokens. */
export const Badge: React.FC<BadgeProps> = ({ tone = "neutral", dot = false, children }) => {
  const { bg, text } = TONE_VARS[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-full)",
        background: bg,
        color: text,
        fontSize: "var(--text-xs)",
        fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
        fontFamily: "var(--font-sans)",
        whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "var(--radius-full)",
            background: "currentColor",
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
};

// ── Avatar ────────────────────────────────────────────────────────────────────

export interface AvatarProps {
  /** Image URL. When absent, initials are shown instead. */
  src?: string | null;
  /** Full display name used to derive initials (split on space / @ / . / _ / -). */
  name: string;
  /** Diameter in px. Defaults to 28. */
  size?: number;
}

/** Derives 1–2 uppercase initials from a name string. */
function getInitials(name: string): string {
  // Split on common word-boundary characters used in emails and usernames.
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Round avatar — image when src given, initials otherwise. */
export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 28 }) => {
  const diameter = `${size}px`;
  const baseStyle: React.CSSProperties = {
    width: diameter,
    height: diameter,
    borderRadius: "var(--radius-full)",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };

  if (src) {
    return (
      <span style={baseStyle} aria-hidden="true">
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          style={{ width: diameter, height: diameter, objectFit: "cover", display: "block" }}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      title={name}
      style={{
        ...baseStyle,
        background: "var(--nav-active-bg)",
        color: "var(--nav-active-color)",
        fontSize: `${Math.round(size * 0.42)}px`,
        fontWeight: "var(--fw-semi)" as React.CSSProperties["fontWeight"],
        fontFamily: "var(--font-sans)",
        userSelect: "none",
      }}
    >
      {getInitials(name)}
    </span>
  );
};

// ── MutedCell ─────────────────────────────────────────────────────────────────

export interface MutedCellProps {
  children: React.ReactNode;
}

/** Secondary / de-emphasised cell text in muted colour and small size. */
export const MutedCell: React.FC<MutedCellProps> = ({ children }) => (
  <span
    style={{
      color: "var(--text-muted)",
      fontSize: "var(--text-sm)",
      fontFamily: "var(--font-sans)",
    }}
  >
    {children}
  </span>
);
