/**
 * AdminShell — office app shell with sidebar + topbar.
 *
 * Layout matches "App Shell - ilikebuffet Admin.dc.html":
 *   - Sidebar: 248px, white bg, branch switcher, nav groups, system links
 *   - Topbar: 56px, white bg, page title + actions slot
 *   - Content: flex-1, bg-page (#FAF8F6)
 *
 * widthTier=office: min-width 1440px, non-responsive (DECISION #8).
 */

import * as React from "react";
import { useAuth } from "../auth/auth-context";
import { canAccessPath } from "../lib/rbac";

export interface NavItem {
  id: string;
  label: string;
  path: string;
  /** SVG path data for the 18×18 icon. */
  iconPath: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export interface AdminShellProps {
  children: React.ReactNode;
  /** Active route path — used to highlight current nav item. */
  activePath?: string;
  onNavigate?: (path: string) => void;
  pageTitle?: string;
  topbarActions?: React.ReactNode;
}

const DEFAULT_GROUPS: NavGroup[] = [
  {
    label: "Vận hành",
    items: [
      {
        id: "pos",
        label: "Bán hàng",
        path: "/pos",
        iconPath:
          "M3 3h18v4H3zM3 9h6v12H3zM11 9h10v12H11z",
      },
      {
        id: "orders",
        label: "Đơn hàng",
        path: "/orders",
        iconPath: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
      },
      {
        id: "monitor",
        label: "Theo dõi ca",
        path: "/monitor",
        iconPath: "M3 3v18h18M7 14l3-3 3 3 5-6",
      },
    ],
  },
  {
    label: "Báo cáo & Đối soát",
    items: [
      {
        id: "revenue-report",
        label: "Doanh thu",
        path: "/reports/revenue",
        iconPath: "M3 3v18h18M7 15l3-4 3 2 4-6",
      },
      {
        id: "shift-cash-report",
        label: "Đối soát tiền mặt",
        path: "/reports/shift-cash",
        iconPath: "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
      },
      {
        id: "offline-recon",
        label: "Đối soát offline",
        path: "/reports/offline",
        iconPath: "M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
      },
    ],
  },
  {
    label: "Vé & Giá",
    items: [
      {
        id: "ticket-types",
        label: "Loại vé",
        path: "/settings/ticket-types",
        iconPath: "M4 7a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4zM12 5v14",
      },
      {
        id: "pricing",
        label: "Bảng giá",
        path: "/settings/pricing",
        iconPath: "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
      },
      {
        id: "discounts",
        label: "Giảm giá",
        path: "/settings/discounts",
        iconPath: "M9 9h.01M15 15h.01M16 8l-8 8M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      },
    ],
  },
  {
    label: "Quản lý",
    items: [
      {
        id: "inventory",
        label: "Kho nguyên liệu",
        path: "/inventory",
        iconPath: "M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 3H8L6 7h12l-2-4z",
      },
      {
        id: "suppliers",
        label: "Nhà cung cấp",
        path: "/master-data/suppliers",
        iconPath: "M3 3h18v4H3zM3 10h18v11H3zM8 14h8",
      },
      {
        id: "devices",
        label: "Thiết bị",
        path: "/devices",
        iconPath: "M4 4h16v12H4zM8 20h8M12 16v4",
      },
      {
        id: "holidays",
        label: "Lịch lễ",
        path: "/master-data/holidays",
        iconPath: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z",
      },
      {
        id: "accounts",
        label: "Tài khoản kế toán",
        path: "/master-data/accounts",
        iconPath: "M3 6h18M3 12h18M3 18h18",
      },
      {
        id: "staff",
        label: "Nhân sự",
        path: "/staff",
        iconPath: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
      },
    ],
  },
];

const SYSTEM_ITEMS: NavItem[] = [
  {
    id: "branches",
    label: "Chi nhánh",
    path: "/settings/branches",
    iconPath: "M4 21V4h10v17M14 9h6v12M8 8h2M8 12h2M8 16h2",
  },
  {
    id: "users",
    label: "Người dùng & vai trò",
    path: "/settings/users",
    iconPath:
      "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  },
  {
    id: "log",
    label: "Nhật ký",
    path: "/settings/log",
    iconPath: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  },
];

function NavIcon({ d }: { d: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export const AdminShell: React.FC<AdminShellProps> = ({
  children,
  activePath,
  onNavigate,
  pageTitle,
  topbarActions,
}) => {
  const { selectedBranchId, availableBranches, selectBranch, logout, role } = useAuth();

  const selectedBranch = availableBranches.find((b) => b.id === selectedBranchId);

  // Branch switcher state — show native select on click.
  const [switcherOpen, setSwitcherOpen] = React.useState(false);

  const navItemStyle = (isActive: boolean): React.CSSProperties => ({
    position: "relative",
    height: "var(--nav-item-height, 36px)",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "0 12px",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    fontSize: "var(--text-sm)",
    color: isActive ? "var(--nav-active-color, #1C4842)" : "var(--nav-idle-color, #635B53)",
    background: isActive ? "var(--nav-active-bg, #EFF6F5)" : "transparent",
    fontWeight: isActive ? ("var(--fw-medium)" as React.CSSProperties["fontWeight"]) : undefined,
    border: "none",
    width: "100%",
    textAlign: "left",
    fontFamily: "var(--font-sans)",
    transition: "background var(--dur-fast)",
  });

  return (
    /* widthTier=office: 1440px non-responsive (DECISION #8) */
    <div
      style={{
        display: "flex",
        minWidth: "1440px",
        minHeight: "100vh",
        background: "var(--shell-bg, #FAF8F6)",
      }}
    >
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: "var(--sidebar-width, 248px)",
          flex: "0 0 var(--sidebar-width, 248px)",
          display: "flex",
          flexDirection: "column",
          background: "var(--sidebar-bg, #FFFFFF)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        {/* Brand */}
        <div
          style={{
            height: "var(--topbar-height, 56px)",
            flex: "0 0 var(--topbar-height, 56px)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "0 16px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              /* Brand logo — terracotta is allowed on the logo mark only, not action buttons */
              background: "#C96442",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            i
          </span>
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <strong style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>ilikebuffet</strong>
            <span style={{ fontSize: "11px", color: "var(--nav-label-color, #6E665C)" }}>
              Admin
            </span>
          </span>
        </div>

        {/* Branch switcher (wired to selectBranch) */}
        <div style={{ padding: "12px", borderBottom: "1px solid var(--bg-page, #FAF8F6)", position: "relative" }}>
          {/* Native select for branch switching — opens on button click.
              selectBranch() updates auth context which re-scopes x-branch-id. */}
          {switcherOpen && availableBranches.length > 1 && (
            <select
              aria-label="Chọn chi nhánh"
              size={Math.min(availableBranches.length, 6)}
              defaultValue={selectedBranchId ?? ""}
              onChange={(e) => {
                selectBranch(e.target.value);
                setSwitcherOpen(false);
              }}
              onBlur={() => setSwitcherOpen(false)}
              autoFocus
              style={{
                position: "absolute",
                top: "48px",
                left: "12px",
                right: "12px",
                zIndex: 100,
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-raised, #FFFFFF)",
                boxShadow: "var(--shadow-md)",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                padding: "var(--space-1)",
              }}
            >
              {availableBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            style={{
              width: "100%",
              height: "36px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "0 12px",
              background: "var(--bg-page, #FAF8F6)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              textAlign: "left",
            }}
            aria-label="Đổi chi nhánh"
            aria-expanded={switcherOpen}
          >
            <span
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "4px",
                background: "var(--nav-active-bg, #EFF6F5)",
                color: "var(--action-bg, #235B54)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "10px",
                fontWeight: 600,
              }}
            >
              {selectedBranch?.name?.slice(0, 2).toUpperCase() ?? "–"}
            </span>
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {selectedBranch?.name ?? "Chọn chi nhánh"}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* Nav groups */}
        <nav
          aria-label="Điều hướng chính"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          {DEFAULT_GROUPS.map((group) => (
            <div
              key={group.label ?? "default"}
              style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "10px" }}
            >
              {group.label && (
                <div
                  style={{
                    fontSize: "11px",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--nav-label-color, #6E665C)",
                    padding: "10px 10px 4px",
                  }}
                >
                  {group.label}
                </div>
              )}
              {group.items.filter((item) => canAccessPath(role, item.path)).map((item) => {
                const isActive = activePath === item.path;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate?.(item.path)}
                    style={navItemStyle(isActive)}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {isActive && (
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          top: "6px",
                          bottom: "6px",
                          width: "3px",
                          borderRadius: "0 2px 2px 0",
                          background: "var(--nav-active-accent, #2F7168)",
                        }}
                        aria-hidden="true"
                      />
                    )}
                    <NavIcon d={item.iconPath} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* System links + logout */}
        <div
          style={{
            borderTop: "1px solid var(--border-subtle)",
            padding: "8px 12px 12px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--nav-label-color)",
              padding: "8px 12px 4px",
            }}
          >
            Hệ thống
          </div>
          {SYSTEM_ITEMS.filter((item) => canAccessPath(role, item.path)).map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate?.(item.path)}
              style={navItemStyle(activePath === item.path)}
            >
              <NavIcon d={item.iconPath} />
              <span>{item.label}</span>
            </button>
          ))}
          <button
            onClick={logout}
            style={{
              ...navItemStyle(false),
              color: "#C0392B",
              marginTop: "var(--space-2)",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <header
          style={{
            height: "var(--topbar-height, 56px)",
            flex: "0 0 var(--topbar-height, 56px)",
            display: "flex",
            alignItems: "center",
            padding: "0 var(--space-5)",
            background: "var(--topbar-bg, #FFFFFF)",
            borderBottom: "1px solid var(--border-subtle)",
            gap: "var(--space-4)",
          }}
        >
          <h1
            style={{
              flex: 1,
              margin: 0,
              fontSize: "var(--text-base)",
              fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              fontFamily: "var(--font-sans)",
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {pageTitle ?? ""}
          </h1>
          {topbarActions && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              {topbarActions}
            </div>
          )}
        </header>

        {/* Page content */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "var(--space-5)",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
