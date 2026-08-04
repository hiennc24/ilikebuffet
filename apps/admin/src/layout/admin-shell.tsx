/**
 * AdminShell — office app shell with sidebar + topbar.
 *
 * Layout matches "App Shell - ilikebuffet Admin.dc.html":
 *   - Sidebar: 248px, white bg, branch switcher, nav groups, system links
 *   - Topbar: 56px, white bg, page title + actions slot
 *   - Content: flex-1, bg-page (#FAF8F6)
 *
 * widthTier=office: min-width 1440px, non-responsive (DECISION #8).
 *
 * Topbar right cluster (left-to-right): Search · Notifications · Dark-mode · User menu
 */

import * as React from "react";
import { useAuth } from "../auth/auth-context";
import { canAccessPath } from "../lib/rbac";
import { useIsCompact } from "../lib/use-media-query";
import { useTheme } from "../lib/theme";
import { useSidebarCollapsed } from "../lib/use-sidebar";
import { PageHeader, buildPathGroups } from "./page-header";

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
  /** Right-aligned action slot rendered inside the in-content PageHeader. */
  pageActions?: React.ReactNode;
  /** Optional toolbar row (e.g. PageTabs) rendered below the breadcrumb row. */
  pageToolbar?: React.ReactNode;
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
        id: "chain-overview",
        label: "Tổng quan chuỗi",
        path: "/reports/chain",
        iconPath: "M3 21h18M6 21V9l6-4 6 4v12M9 21v-6h6v6",
      },
      {
        id: "revenue-report",
        label: "Doanh thu",
        path: "/reports/revenue",
        iconPath: "M3 3v18h18M7 15l3-4 3 2 4-6",
      },
      {
        id: "gross-margin-report",
        label: "Lãi gộp",
        path: "/reports/gross-margin",
        iconPath: "M3 3v18h18M7 14l3 3 7-8M14 9h3v3",
      },
      {
        id: "pnl-report",
        label: "Lãi/lỗ",
        path: "/reports/pnl",
        iconPath: "M3 3v18h18M7 13l3 3 4-5 3 3",
      },
      {
        id: "shift-cash-report",
        label: "Đối soát tiền mặt",
        path: "/reports/shift-cash",
        iconPath: "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
      },
      {
        id: "bank-reconcile",
        label: "Đối soát ngân hàng",
        path: "/reports/bank-reconcile",
        iconPath: "M3 21h18M4 10h16M5 10V7l7-4 7 4v3M6 10v8M10 10v8M14 10v8M18 10v8",
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
        id: "purchase-orders",
        label: "Đơn mua",
        path: "/inventory/purchase-orders",
        iconPath: "M9 5h6l1 2h3a1 1 0 011 1v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1h3zM9 12l2 2 4-4",
      },
      {
        id: "stock",
        label: "Tồn kho",
        path: "/inventory/stock",
        iconPath: "M3 9l9-6 9 6v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 9h18M9 21V13h6v8",
      },
      {
        id: "stock-transfer",
        label: "Điều chuyển kho",
        path: "/inventory/transfers",
        iconPath: "M4 7h13l-3-3M20 17H7l3 3",
      },
      {
        id: "recipes",
        label: "Định mức",
        path: "/inventory/recipes",
        iconPath: "M4 4h16v4H4zM4 12h10M4 16h10M4 20h6M18 12v8M15 15l3-3 3 3",
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
        id: "finance",
        label: "Thu - Chi",
        path: "/finance",
        iconPath: "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
      },
      {
        id: "supplier-debt",
        label: "Công nợ NCC",
        path: "/finance/payables",
        iconPath: "M3 10h18M7 15h4M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z",
      },
      {
        id: "supplier-aging",
        label: "Tuổi nợ NCC",
        path: "/finance/aging",
        iconPath: "M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
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
    id: "permissions",
    label: "Vai trò & phân quyền",
    path: "/settings/permissions",
    iconPath: "M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6zM9.5 12l1.8 1.8L15 10",
  },
  {
    id: "log",
    label: "Nhật ký",
    path: "/settings/log",
    iconPath: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  },
];

/** Vietnamese display labels for each role code. */
const ROLE_LABELS: Record<string, string> = {
  QUAN_TRI_HQ:  "Quản trị HQ",
  CHU_CHUOI:    "Chủ chuỗi",
  KE_TOAN_CHUOI: "Kế toán chuỗi",
  QUAN_LY_CN:   "Quản lý CN",
  THU_NGAN:     "Thu ngân",
  THU_KHO:      "Thủ kho",
};

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

/** Shared icon button style for the topbar cluster. */
function topbarIconBtnStyle(extraStyle?: React.CSSProperties): React.CSSProperties {
  return {
    width: "40px",
    height: "40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    color: "var(--text-secondary)",
    flexShrink: 0,
    transition: "background var(--dur-fast)",
    ...extraStyle,
  };
}

/** Shared dropdown container style. */
function dropdownStyle(extraStyle?: React.CSSProperties): React.CSSProperties {
  return {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    minWidth: "220px",
    background: "var(--bg-raised)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-md)",
    zIndex: 200,
    overflow: "hidden",
    ...extraStyle,
  };
}

/** Normalise a Vietnamese string for accent-insensitive search. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d");
}

// ── Notifications bell ────────────────────────────────────────────────────────

interface NotificationsBellProps {
  count?: number;
}

function NotificationsBell({ count = 0 }: NotificationsBellProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Esc.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Thông báo"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        style={topbarIconBtnStyle()}
      >
        {/* Bell icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {count > 0 && (
          <span
            aria-label={`${count} thông báo`}
            style={{
              position: "absolute",
              top: "6px",
              right: "6px",
              width: "8px",
              height: "8px",
              borderRadius: "var(--radius-full)",
              background: "#C0392B",
              border: "2px solid var(--topbar-bg, #FFFFFF)",
            }}
          />
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Thông báo" style={dropdownStyle({ minWidth: "280px" })}>
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-subtle)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              color: "var(--text-primary)",
              fontFamily: "var(--font-sans)",
            }}
          >
            Thông báo
          </div>
          <div
            style={{
              padding: "24px 16px",
              textAlign: "center",
              fontSize: "var(--text-sm)",
              color: "var(--text-muted)",
              fontFamily: "var(--font-sans)",
            }}
          >
            Chưa có thông báo
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dark-mode toggle ──────────────────────────────────────────────────────────

function DarkModeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
      onClick={toggle}
      style={topbarIconBtnStyle()}
    >
      {isDark ? (
        /* Sun icon */
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        /* Moon icon */
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  );
}

// ── User menu ─────────────────────────────────────────────────────────────────

interface UserMenuProps {
  username: string | null;
  role: string | null;
  branchName: string | undefined;
  onLogout: () => void;
  compact: boolean;
}

function UserMenu({ username, role, branchName, onLogout, compact }: UserMenuProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Initials: first letters of the two parts split on @ or space.
  const initials = React.useMemo(() => {
    if (!username) return "?";
    const name = username.split("@")[0];
    const parts = name.split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [username]);

  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : "";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Menu tài khoản"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          height: "40px",
          padding: compact ? "0 4px" : "0 8px",
          background: "transparent",
          border: "none",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          color: "var(--text-primary)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {/* Avatar circle */}
        <span
          aria-hidden="true"
          style={{
            width: "30px",
            height: "30px",
            borderRadius: "var(--radius-full)",
            background: "var(--nav-active-bg, #EFF6F5)",
            color: "var(--nav-active-color, #1C4842)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: "var(--fw-semi)" as React.CSSProperties["fontWeight"],
            flexShrink: 0,
          }}
        >
          {initials}
        </span>
        {!compact && username && (
          <span
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              color: "var(--text-primary)",
              maxWidth: "120px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {username}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Menu tài khoản" style={dropdownStyle()}>
          {/* User info header */}
          <div
            style={{
              padding: "14px 16px 12px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
                color: "var(--text-primary)",
                fontFamily: "var(--font-sans)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {username ?? "–"}
            </div>
            {roleLabel && (
              <div
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-sans)",
                  marginTop: "2px",
                }}
              >
                {roleLabel}
              </div>
            )}
            {branchName && (
              <div
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-sans)",
                  marginTop: "2px",
                }}
              >
                {branchName}
              </div>
            )}
          </div>
          {/* Logout */}
          <div style={{ padding: "6px" }}>
            <button
              type="button"
              onClick={() => { setOpen(false); onLogout(); }}
              style={{
                width: "100%",
                height: "36px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "0 10px",
                background: "transparent",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                color: "#C0392B",
                fontSize: "var(--text-sm)",
                fontFamily: "var(--font-sans)",
                textAlign: "left",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Command palette search ────────────────────────────────────────────────────

interface CommandPaletteProps {
  role: string | null;
  onNavigate: (path: string) => void;
  compact: boolean;
}

function CommandPalette({ role, onNavigate, compact }: CommandPaletteProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  // Global Cmd/Ctrl+K shortcut.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened.
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(0);
      // Next tick so the element is mounted.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // All accessible nav items (flat).
  const allItems = React.useMemo<NavItem[]>(() => {
    const items: NavItem[] = [];
    for (const group of DEFAULT_GROUPS) {
      for (const item of group.items) {
        if (canAccessPath(role, item.path)) items.push(item);
      }
    }
    for (const item of SYSTEM_ITEMS) {
      if (canAccessPath(role, item.path)) items.push(item);
    }
    return items;
  }, [role]);

  // Filtered results.
  const results = React.useMemo<NavItem[]>(() => {
    if (!query.trim()) return allItems;
    const q = normalise(query.trim());
    return allItems.filter((item) => normalise(item.label).includes(q));
  }, [query, allItems]);

  // Clamp highlight index when results change.
  React.useEffect(() => {
    setHighlighted((h) => Math.min(h, Math.max(results.length - 1, 0)));
  }, [results]);

  // Keyboard navigation inside palette.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (results[highlighted]) {
        onNavigate(results[highlighted].path);
        setOpen(false);
      }
    }
  };

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        aria-label="Tìm kiếm"
        onClick={() => setOpen(true)}
        style={
          compact
            ? topbarIconBtnStyle()
            : {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                height: "36px",
                padding: "0 12px",
                background: "var(--bg-page)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: "var(--text-sm)",
                fontFamily: "var(--font-sans)",
                flexShrink: 0,
              }
        }
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        {!compact && <span>Tìm kiếm…</span>}
        {!compact && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: "11px",
              color: "var(--text-muted)",
              background: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "1px 5px",
            }}
          >
            ⌘K
          </span>
        )}
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          aria-modal="true"
          role="dialog"
          aria-label="Tìm kiếm và điều hướng"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1100,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "80px",
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            style={{
              width: "min(600px, calc(100vw - 32px))",
              background: "var(--bg-raised)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
            }}
            onKeyDown={handleKeyDown}
          >
            {/* Search input */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "0 16px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="Tìm kiếm…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlighted(0); }}
                style={{
                  flex: 1,
                  height: "52px",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: "var(--text-base)",
                  fontFamily: "var(--font-sans)",
                  color: "var(--text-primary)",
                }}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
                style={{
                  background: "transparent",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "2px 6px",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Esc
              </button>
            </div>

            {/* Results list */}
            <ul
              ref={listRef}
              role="listbox"
              aria-label="Kết quả tìm kiếm"
              style={{
                listStyle: "none",
                margin: 0,
                padding: "6px",
                maxHeight: "360px",
                overflowY: "auto",
              }}
            >
              {results.length === 0 && (
                <li
                  style={{
                    padding: "20px 16px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: "var(--text-sm)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  Không tìm thấy kết quả
                </li>
              )}
              {results.map((item, idx) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={idx === highlighted}
                  onClick={() => { onNavigate(item.path); setOpen(false); }}
                  onMouseEnter={() => setHighlighted(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "0 12px",
                    height: "44px",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    background: idx === highlighted ? "var(--nav-active-bg, #EFF6F5)" : "transparent",
                    color: idx === highlighted ? "var(--nav-active-color, #1C4842)" : "var(--text-primary)",
                    fontSize: "var(--text-sm)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  <NavIcon d={item.iconPath} />
                  <span>{item.label}</span>
                  <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    {item.path}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

// ── Branch switcher ───────────────────────────────────────────────────────────

interface BranchOption {
  id: string;
  name: string;
}

interface BranchSwitcherProps {
  /** topbar = auto-width pill (desktop header); sidebar = full-width (mobile drawer). */
  variant: "topbar" | "sidebar";
  selectedBranch: BranchOption | undefined;
  selectedBranchId: string | null;
  availableBranches: BranchOption[];
  onSelect: (id: string) => void;
}

function BranchSwitcher({ variant, selectedBranch, selectedBranchId, availableBranches, onSelect }: BranchSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const canSwitch = availableBranches.length > 1;

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Esc.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const isTopbar = variant === "topbar";

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => canSwitch && setOpen((v) => !v)}
        aria-label="Đổi chi nhánh"
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          width: isTopbar ? "auto" : "100%",
          maxWidth: isTopbar ? "240px" : undefined,
          height: "36px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "0 12px",
          background: "var(--bg-page, #FAF8F6)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          cursor: canSwitch ? "pointer" : "default",
          fontFamily: "var(--font-sans)",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden="true"
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
            flexShrink: 0,
          }}
        >
          {selectedBranch?.name?.slice(0, 2).toUpperCase() ?? "–"}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
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
        {canSwitch && (
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
            style={{ flexShrink: 0 }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {/* Native select for branch switching — selectBranch() re-scopes x-branch-id. */}
      {open && canSwitch && (
        <select
          aria-label="Chọn chi nhánh"
          size={Math.min(availableBranches.length, 6)}
          defaultValue={selectedBranchId ?? ""}
          onChange={(e) => {
            onSelect(e.target.value);
            setOpen(false);
          }}
          autoFocus
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: "220px",
            width: "100%",
            zIndex: 200,
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
    </div>
  );
}

// ── PATH_GROUPS (derived once from nav data, passed to PageHeader) ────────────

/** Path → parent nav-group label, longest path first so sub-routes prefix-match. */
const PATH_GROUPS = buildPathGroups(DEFAULT_GROUPS, SYSTEM_ITEMS);

// ── AdminShell ────────────────────────────────────────────────────────────────

export const AdminShell: React.FC<AdminShellProps> = ({
  children,
  activePath,
  onNavigate,
  pageTitle,
  topbarActions,
  pageActions,
  pageToolbar,
}) => {
  const { selectedBranchId, availableBranches, selectBranch, logout, role, username } = useAuth();

  const selectedBranch = availableBranches.find((b) => b.id === selectedBranchId);

  // Below the desktop breakpoint the sidebar becomes an off-canvas drawer.
  const compact = useIsCompact();
  const { collapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  // Rail = icon-only desktop sidebar. Only active when desktop (not compact).
  const rail = collapsed && !compact;
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  // Close the drawer whenever we grow back to desktop so it can't get stuck open.
  React.useEffect(() => {
    if (!compact) setDrawerOpen(false);
  }, [compact]);
  // Navigating from the drawer should close it.
  const navigate = (path: string) => {
    onNavigate?.(path);
    if (compact) setDrawerOpen(false);
  };

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
    /* Responsive: fixed sidebar ≥1024px; off-canvas drawer below. */
    <div
      style={{
        display: "flex",
        minHeight: "100dvh",
        background: "var(--shell-bg, #FAF8F6)",
      }}
    >
      {/* Scrim behind the drawer on compact widths. */}
      {compact && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 900 }}
        />
      )}

      {/* ── Sidebar / drawer ── */}
      <aside
        aria-hidden={compact && !drawerOpen ? true : undefined}
        style={{
          display: "flex",
          flexDirection: "column",
          background: "var(--sidebar-bg, #FFFFFF)",
          borderRight: "1px solid var(--border-subtle)",
          // The nav (flex:1, overflowY:auto) scrolls internally; the shell height is capped.
          height: "100dvh",
          ...(compact
            ? {
                // Off-canvas: fixed, slides in from the left, above the scrim.
                // Compact drawer always uses full sidebar width regardless of collapsed state.
                width: "var(--sidebar-width, 248px)",
                position: "fixed",
                top: 0,
                left: 0,
                zIndex: 1000,
                transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform var(--dur-med, 220ms) ease",
                boxShadow: drawerOpen ? "var(--shadow-lg, 0 10px 40px rgba(0,0,0,0.2))" : "none",
              }
            : {
                // Desktop: sticky column; animates between full and rail width.
                width: rail ? "var(--sidebar-rail-width, 72px)" : "var(--sidebar-width, 248px)",
                flex: `0 0 ${rail ? "var(--sidebar-rail-width, 72px)" : "var(--sidebar-width, 248px)"}`,
                position: "sticky",
                top: 0,
                alignSelf: "flex-start",
                transition: "width var(--dur-med, 220ms) ease, flex-basis var(--dur-med, 220ms) ease",
                overflow: "hidden",
              }),
        }}
      >
        {/* Brand */}
        <div
          style={{
            height: "var(--topbar-height, 56px)",
            flex: "0 0 var(--topbar-height, 56px)",
            display: "flex",
            alignItems: "center",
            justifyContent: rail ? "center" : undefined,
            gap: rail ? 0 : "12px",
            padding: rail ? "0" : "0 16px",
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
              flexShrink: 0,
            }}
          >
            i
          </span>
          {!rail && (
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
              <strong style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>ilikebuffet</strong>
              <span style={{ fontSize: "11px", color: "var(--nav-label-color, #6E665C)" }}>
                Admin
              </span>
            </span>
          )}
        </div>

        {/* Branch switcher — sidebar placement is for compact widths only; on desktop
            it lives in the topbar (see below), so we don't render it twice. */}
        {compact && (
          <div style={{ padding: "12px", borderBottom: "1px solid var(--bg-page, #FAF8F6)" }}>
            <BranchSwitcher
              variant="sidebar"
              selectedBranch={selectedBranch}
              selectedBranchId={selectedBranchId}
              availableBranches={availableBranches}
              onSelect={selectBranch}
            />
          </div>
        )}

        {/* Nav groups */}
        <nav
          aria-label="Điều hướng chính"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: rail ? "8px 4px 16px" : "8px 12px 16px",
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
              {/* Group section labels are hidden in rail mode */}
              {group.label && !rail && (
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
                    onClick={() => navigate(item.path)}
                    title={rail ? item.label : undefined}
                    aria-label={rail ? item.label : undefined}
                    style={{
                      ...navItemStyle(isActive),
                      ...(rail
                        ? {
                            justifyContent: "center",
                            padding: "0",
                            gap: 0,
                          }
                        : {}),
                    }}
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
                    {!rail && (
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.label}
                      </span>
                    )}
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
            padding: rail ? "8px 4px 12px" : "8px 12px 12px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          {/* "Hệ thống" section label is hidden in rail mode */}
          {!rail && (
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
          )}
          {SYSTEM_ITEMS.filter((item) => canAccessPath(role, item.path)).map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              title={rail ? item.label : undefined}
              aria-label={rail ? item.label : undefined}
              style={{
                ...navItemStyle(activePath === item.path),
                ...(rail
                  ? {
                      justifyContent: "center",
                      padding: "0",
                      gap: 0,
                    }
                  : {}),
              }}
            >
              <NavIcon d={item.iconPath} />
              {!rail && <span>{item.label}</span>}
            </button>
          ))}
          <button
            onClick={logout}
            title={rail ? "Đăng xuất" : undefined}
            aria-label={rail ? "Đăng xuất" : undefined}
            style={{
              ...navItemStyle(false),
              color: "#C0392B",
              marginTop: "var(--space-2)",
              ...(rail
                ? {
                    justifyContent: "center",
                    padding: "0",
                    gap: 0,
                  }
                : {}),
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
            {!rail && <span>Đăng xuất</span>}
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
            padding: compact ? "0 var(--space-3)" : "0 var(--space-5)",
            // Desktop: give the bordered branch-switcher pill a deliberate left gutter
            // off the sidebar (one step past the content padding) so it doesn't read as
            // flush against the sidebar edge; right cluster stays right-aligned via the flex spacer.
            paddingLeft: compact
              ? "max(var(--space-3), env(safe-area-inset-left))"
              : "var(--space-6)",
            background: "var(--topbar-bg, #FFFFFF)",
            borderBottom: "1px solid var(--border-subtle)",
            gap: compact ? "var(--space-2)" : "var(--space-4)",
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          {compact && (
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label="Mở menu điều hướng"
              aria-expanded={drawerOpen}
              style={{
                width: "44px",
                height: "44px",
                margin: "0 -6px 0 -8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                color: "var(--text-primary)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          )}
          {/* Desktop-only: sidebar rail toggle (collapse/expand). */}
          {!compact && (
            <button
              type="button"
              aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
              onClick={toggleSidebar}
              style={topbarIconBtnStyle()}
            >
              {/* Panel icon: outer rectangle with a vertical divider line */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>
          )}
          {/* Branch context lives here on desktop (replaces the page title, which
              now reads from the breadcrumb below). Compact keeps it in the drawer. */}
          {!compact && (
            <BranchSwitcher
              variant="topbar"
              selectedBranch={selectedBranch}
              selectedBranchId={selectedBranchId}
              availableBranches={availableBranches}
              onSelect={selectBranch}
            />
          )}
          <div style={{ flex: 1 }} />

          {/* ── Right-side topbar cluster ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
              flexShrink: 0,
            }}
          >
            <CommandPalette role={role} onNavigate={navigate} compact={compact} />
            <NotificationsBell count={0} />
            <DarkModeToggle />
            <UserMenu
              username={username}
              role={role}
              branchName={selectedBranch?.name}
              onLogout={logout}
              compact={compact}
            />

            {/* Slot for page-level actions (e.g. "Tạo mới" button) */}
            {topbarActions && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  marginLeft: "var(--space-2)",
                  paddingLeft: "var(--space-2)",
                  borderLeft: "1px solid var(--border-subtle)",
                }}
              >
                {topbarActions}
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: compact ? "var(--space-3)" : "var(--space-5)",
            // Keep content clear of the notch / home indicator on mobile.
            paddingBottom: compact ? "max(var(--space-3), env(safe-area-inset-bottom))" : undefined,
          }}
        >
          <PageHeader
            activePath={activePath}
            pageTitle={pageTitle}
            actions={pageActions}
            toolbar={pageToolbar}
            onNavigate={navigate}
            pathGroups={PATH_GROUPS}
          />
          {children}
        </main>
      </div>
    </div>
  );
};
