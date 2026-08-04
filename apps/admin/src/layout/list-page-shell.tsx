/**
 * ListPageShell — the DTV-style scaffold for a list page: page-owned chrome
 * (breadcrumb + big h1 title + right actions + optional toolbar) above a single
 * clean white panel that holds the table and (optionally) its pagination.
 *
 * Pages render this instead of wrapping content in a titled Card, so the title
 * appears once (in the header) and the table floats in a bordered panel — matching
 * the reference admin. Use with `<ShellLayout bareChrome>` so the global shell
 * header isn't rendered twice.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "./page-header";

export interface ListPageShellProps {
  /** Route path for the breadcrumb (e.g. "/settings/users"). */
  activePath: string;
  /** Big h1 page title (last breadcrumb crumb). */
  pageTitle: string;
  /** Right-aligned header actions (e.g. a "Tạo mới" button). */
  actions?: React.ReactNode;
  /** Toolbar row under the title (tabs + search + filters). */
  toolbar?: React.ReactNode;
  /** Pagination control — rendered inside the panel, padded, under the table. */
  pagination?: React.ReactNode;
  /** The table (or loading/error/empty state) shown inside the panel. */
  children: React.ReactNode;
}

export const ListPageShell: React.FC<ListPageShellProps> = ({
  activePath,
  pageTitle,
  actions,
  toolbar,
  pagination,
  children,
}) => {
  const navigate = useNavigate();
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <PageHeader
        activePath={activePath}
        pageTitle={pageTitle}
        actions={actions}
        toolbar={toolbar}
        onNavigate={(p) => navigate(p)}
      />
      <section
        style={{
          background: "var(--bg-raised, #FFFFFF)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          overflow: "hidden",
        }}
      >
        {children}
        {pagination && (
          // The last table row's border is the divider above the pagination.
          <div style={{ padding: "var(--space-3) var(--space-4)" }}>{pagination}</div>
        )}
      </section>
    </div>
  );
};
