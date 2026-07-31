/**
 * PosShell — ops app shell for the POS PWA.
 *
 * widthTier=ops: responsive from 768px (DECISION #8).
 * Touch targets ≥48px throughout (DECISION #8).
 * No sidebar — ops layout is a top-bar + full-height content area.
 */

import * as React from "react";

export interface PosShellProps {
  children: React.ReactNode;
  pageTitle?: string;
  topbarActions?: React.ReactNode;
}

export const PosShell: React.FC<PosShellProps> = ({
  children,
  pageTitle,
  topbarActions,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        /* widthTier=ops: responsive from 768px (DECISION #8) */
        minWidth: "320px",
        minHeight: "100vh",
        background: "var(--bg-page, #FAF8F6)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Topbar — min touch height */}
      <header
        style={{
          height: "var(--touch-min, 48px)",
          display: "flex",
          alignItems: "center",
          padding: "0 var(--space-4)",
          background: "var(--bg-raised, #FFFFFF)",
          borderBottom: "1px solid var(--border-subtle)",
          gap: "var(--space-3)",
        }}
      >
        {/* Brand mark */}
        <span
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "6px",
            background: "#C96442",
            color: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          i
        </span>

        <span
          style={{
            flex: 1,
            fontSize: "var(--text-sm)",
            fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {pageTitle ?? "POS"}
        </span>

        {topbarActions && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            {topbarActions}
          </div>
        )}
      </header>

      {/* Content */}
      <main style={{ flex: 1, overflow: "auto" }}>{children}</main>
    </div>
  );
};
