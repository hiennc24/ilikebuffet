/**
 * PageHeader — in-content page header with breadcrumb, big h1 title, actions slot, and optional toolbar.
 *
 * Structure:
 *   <header>
 *     <nav aria-label="Breadcrumb">
 *       <ol>  home? › group? › <h1 aria-current="page">
 *       + right-aligned actions slot
 *     </nav>
 *     [toolbar row — e.g. PageTabs]
 *   </header>
 */

import * as React from "react";
import type { NavGroup, NavItem } from "./admin-shell";

// ── Path → group lookup (built from the nav arrays imported from admin-shell) ──

/**
 * Build PATH_GROUPS from nav arrays. Exported so admin-shell can consume the
 * same derivation without duplicating the nav data.
 */
export function buildPathGroups(
  defaultGroups: NavGroup[],
  systemItems: NavItem[],
): { path: string; group: string }[] {
  return [
    ...defaultGroups.flatMap((g) =>
      g.items.map((i) => ({ path: i.path, group: g.label ?? "" })),
    ),
    ...systemItems.map((i) => ({ path: i.path, group: "Hệ thống" })),
  ].sort((a, b) => b.path.length - a.path.length);
}

/** Cached PATH_GROUPS — populated on first call to groupForPath. */
let _pathGroups: { path: string; group: string }[] | null = null;

/**
 * Lazily-initialised lookup. Accepts an optional override for testing.
 * In production the admin-shell passes its nav arrays at first render.
 */
export function initPathGroups(groups: { path: string; group: string }[]): void {
  _pathGroups = groups;
}

/** The nav group a route belongs to (exact match, else longest matching prefix). */
export function groupForPath(path: string, pathGroups?: { path: string; group: string }[]): string | null {
  const pg = pathGroups ?? _pathGroups ?? [];
  const hit = pg.find((e) => path === e.path || path.startsWith(`${e.path}/`));
  return hit && hit.group ? hit.group : null;
}

// ── Collapse helper ────────────────────────────────────────────────────────────

export interface CrumbDef {
  label: string;
  path?: string;
  isCurrent?: boolean;
}

/**
 * Collapse middle parents when total crumbs > maxVisible.
 * Keeps: home crumb + last parent crumb + current page crumb.
 * Middle ones become a single "…" placeholder.
 *
 * Example: [Home, A, B, C, Page] → [Home, …, C, Page] with maxVisible=4.
 */
export function collapseCrumbs(crumbs: CrumbDef[], maxVisible = 4): CrumbDef[] {
  if (crumbs.length <= maxVisible) return crumbs;
  // Keep first (home), keep last two (last parent + current page).
  const first = crumbs[0];
  const tail = crumbs.slice(-2);
  return [first, { label: "…" }, ...tail];
}

// ── PageTabs ──────────────────────────────────────────────────────────────────

export interface TabItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface PageTabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
}

export function PageTabs({ items, value, onChange }: PageTabsProps) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 0,
        borderBottom: "2px solid var(--border-subtle)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "0 16px",
              height: "40px",
              background: "transparent",
              border: "none",
              borderBottom: active
                ? "2px solid var(--action-bg, #235B54)"
                : "2px solid transparent",
              marginBottom: "-2px",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: active
                ? ("var(--fw-medium)" as React.CSSProperties["fontWeight"])
                : undefined,
              color: active
                ? "var(--nav-active-color, #1C4842)"
                : "var(--text-muted)",
              transition: "color var(--dur-fast), border-color var(--dur-fast)",
              whiteSpace: "nowrap",
            }}
          >
            {item.icon && <span aria-hidden="true">{item.icon}</span>}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "18px",
                  height: "18px",
                  padding: "0 5px",
                  borderRadius: "var(--radius-full)",
                  background: active
                    ? "var(--nav-active-bg, #EFF6F5)"
                    : "var(--bg-page, #FAF8F6)",
                  color: "var(--text-muted)",
                  fontSize: "11px",
                  fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
                }}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── PageHeader ────────────────────────────────────────────────────────────────

export interface PageHeaderProps {
  activePath?: string;
  pageTitle?: string;
  /** Right-aligned action buttons (e.g. "Tạo mới"). */
  actions?: React.ReactNode;
  /** Optional toolbar row below the breadcrumb row (e.g. <PageTabs />). */
  toolbar?: React.ReactNode;
  onNavigate: (path: string) => void;
  /** Pre-built path groups (from admin-shell); avoids re-deriving on every render. */
  pathGroups?: { path: string; group: string }[];
}

export function PageHeader({
  activePath,
  pageTitle,
  actions,
  toolbar,
  onNavigate,
  pathGroups,
}: PageHeaderProps) {
  const path = activePath ?? "/";
  const page = pageTitle ?? "";

  // Build crumb list.
  const rawCrumbs: CrumbDef[] = React.useMemo(() => {
    if (path === "/") {
      return [{ label: page || "Tổng quan", isCurrent: true }];
    }
    const crumbs: CrumbDef[] = [{ label: "Tổng quan", path: "/" }];
    const group = groupForPath(path, pathGroups);
    if (group) crumbs.push({ label: group });
    if (page) crumbs.push({ label: page, isCurrent: true });
    return crumbs;
  }, [path, page, pathGroups]);

  const crumbs = collapseCrumbs(rawCrumbs);

  return (
    <header
      style={{
        marginBottom: "var(--space-4)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Top row: breadcrumb (flex:1) + actions (shrink:0) */}
      <nav
        aria-label="Breadcrumb"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          minWidth: 0,
        }}
      >
        <ol
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "6px",
            listStyle: "none",
            margin: 0,
            padding: 0,
            flex: 1,
            minWidth: 0,
          }}
        >
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li
                key={`${c.label}-${i}`}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                {i > 0 && (
                  <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
                    ›
                  </span>
                )}

                {/* Last crumb: big h1 title */}
                {last ? (
                  <h1
                    aria-current="page"
                    style={{
                      margin: 0,
                      fontSize: "var(--text-lg, 1.5rem)",
                      fontWeight: "var(--fw-semi)" as React.CSSProperties["fontWeight"],
                      color: "var(--text-primary)",
                      lineHeight: 1.25,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.label}
                  </h1>
                ) : c.label === "…" ? (
                  /* Collapsed middle parents */
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: "var(--text-sm)",
                      color: "var(--text-muted)",
                    }}
                  >
                    …
                  </span>
                ) : c.path ? (
                  /* Clickable parent crumb */
                  <button
                    type="button"
                    onClick={() => onNavigate(c.path as string)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--text-sm)",
                    }}
                  >
                    {c.label}
                  </button>
                ) : (
                  /* Non-clickable parent (group label) */
                  <span
                    style={{
                      fontSize: "var(--text-sm)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {c.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {/* Right-aligned actions */}
        {actions && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              flexShrink: 0,
            }}
          >
            {actions}
          </div>
        )}
      </nav>

      {/* Optional toolbar row (e.g. tabs) */}
      {toolbar && (
        <div style={{ marginTop: "var(--space-3)" }}>{toolbar}</div>
      )}
    </header>
  );
}
