/**
 * AdminShell responsive tests — hamburger + drawer below the desktop breakpoint,
 * fixed sidebar (no hamburger) at desktop width, and desktop sidebar rail toggle.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { AdminShell } from "./admin-shell";
import { _resetSidebarStore } from "../lib/use-sidebar";

/** Stub window.matchMedia so `(max-width: 1023px)` reports the given compact state. */
function stubMatchMedia(compact: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: query.includes("max-width") ? compact : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  );
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider apiBaseUrl="">{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("AdminShell responsive", () => {
  beforeEach(() => {
    sessionStorage.setItem("ibb_admin_at", "at");
    sessionStorage.setItem("ibb_admin_rt", "rt");
    localStorage.setItem("ibb_admin_branch", "b1");
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof globalThis.fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("shows a hamburger that toggles the drawer on compact widths", () => {
    stubMatchMedia(true);
    render(<AdminShell pageTitle="Tổng quan"><div>nội dung</div></AdminShell>, { wrapper });

    const burger = screen.getByLabelText("Mở menu điều hướng");
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(burger);
    expect(burger.getAttribute("aria-expanded")).toBe("true");
  });

  it("has no hamburger at desktop width (fixed sidebar)", () => {
    stubMatchMedia(false);
    render(<AdminShell pageTitle="Tổng quan"><div>nội dung</div></AdminShell>, { wrapper });
    expect(screen.queryByLabelText("Mở menu điều hướng")).toBeNull();
  });

  it("renders the branch switcher exactly once — in the topbar on desktop", () => {
    stubMatchMedia(false);
    render(<AdminShell activePath="/monitor" pageTitle="Theo dõi ca"><div /></AdminShell>, { wrapper });
    expect(screen.getAllByLabelText("Đổi chi nhánh")).toHaveLength(1);
  });

  it("renders the branch switcher in the sidebar drawer on compact widths", () => {
    stubMatchMedia(true);
    render(<AdminShell activePath="/monitor" pageTitle="Theo dõi ca"><div /></AdminShell>, { wrapper });
    expect(screen.getAllByLabelText("Đổi chi nhánh")).toHaveLength(1);
  });
});

describe("AdminShell breadcrumb", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    sessionStorage.setItem("ibb_admin_at", "at");
    sessionStorage.setItem("ibb_admin_rt", "rt");
    localStorage.setItem("ibb_admin_branch", "b1");
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof globalThis.fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("shows a 2-level 'home › page' breadcrumb (no group crumb, DTV style)", () => {
    render(<AdminShell activePath="/monitor" pageTitle="Theo dõi ca"><div /></AdminShell>, { wrapper });
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    // Home crumb links back to the overview.
    expect(within(nav).getByRole("button", { name: "Tổng quan" })).toBeInTheDocument();
    // No intermediate group crumb (e.g. "Vận hành").
    expect(within(nav).queryByText("Vận hành")).toBeNull();
    // Current page is marked and not a link.
    expect(within(nav).getByText("Theo dõi ca").getAttribute("aria-current")).toBe("page");
  });

  it("shows the current page as the last crumb for a report route", () => {
    render(<AdminShell activePath="/reports/revenue" pageTitle="Báo cáo doanh thu"><div /></AdminShell>, { wrapper });
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).queryByText("Báo cáo & Đối soát")).toBeNull();
    expect(within(nav).getByText("Báo cáo doanh thu").getAttribute("aria-current")).toBe("page");
  });

  it("navigates home when the 'Tổng quan' crumb is clicked", () => {
    const onNavigate = vi.fn();
    render(<AdminShell activePath="/monitor" pageTitle="Theo dõi ca" onNavigate={onNavigate}><div /></AdminShell>, { wrapper });
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    fireEvent.click(within(nav).getByRole("button", { name: "Tổng quan" }));
    expect(onNavigate).toHaveBeenCalledWith("/");
  });

  it("shows only 'Tổng quan' on the overview route (no home link)", () => {
    render(<AdminShell activePath="/" pageTitle="Tổng quan"><div /></AdminShell>, { wrapper });
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).queryByRole("button", { name: "Tổng quan" })).toBeNull();
    expect(within(nav).getByText("Tổng quan").getAttribute("aria-current")).toBe("page");
  });
});

// ── Desktop rail toggle ───────────────────────────────────────────────────────

describe("AdminShell desktop rail toggle", () => {
  beforeEach(() => {
    stubMatchMedia(false); // desktop
    sessionStorage.setItem("ibb_admin_at", "at");
    sessionStorage.setItem("ibb_admin_rt", "rt");
    localStorage.setItem("ibb_admin_branch", "b1");
    localStorage.removeItem("ibb_admin_sidebar");
    act(() => { _resetSidebarStore(); });
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof globalThis.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
    act(() => { _resetSidebarStore(); });
  });

  it("shows the rail toggle button on desktop with label 'Thu gọn thanh bên'", () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    expect(screen.getByLabelText("Thu gọn thanh bên")).toBeInTheDocument();
  });

  it("does NOT show the rail toggle button on compact (mobile/tablet)", () => {
    stubMatchMedia(true);
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    expect(screen.queryByLabelText(/thanh bên/i)).toBeNull();
  });

  it("clicking the toggle collapses the sidebar — nav item text labels are removed while the nav itself remains accessible by aria-label", () => {
    // Use /pos (Bán hàng) — unrestricted, visible with null role.
    render(
      <AdminShell activePath="/pos" pageTitle="Bán hàng"><div /></AdminShell>,
      { wrapper },
    );

    // Before: "Bán hàng" label text is visible in the nav as a child <span>.
    const navRegion = screen.getByRole("navigation", { name: "Điều hướng chính" });
    expect(within(navRegion).getByText("Bán hàng")).toBeInTheDocument();

    // Collapse.
    fireEvent.click(screen.getByLabelText("Thu gọn thanh bên"));

    // After: the text label span is gone, but the button is still accessible
    // via aria-label (rail mode adds aria-label={item.label} to each nav button).
    expect(within(navRegion).queryByText("Bán hàng")).toBeNull();
    expect(within(navRegion).getByLabelText("Bán hàng")).toBeInTheDocument();
  });

  it("toggle button label flips to 'Mở rộng thanh bên' after collapsing", () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });

    fireEvent.click(screen.getByLabelText("Thu gọn thanh bên"));

    expect(screen.getByLabelText("Mở rộng thanh bên")).toBeInTheDocument();
    expect(screen.queryByLabelText("Thu gọn thanh bên")).toBeNull();
  });

  it("collapsed state is persisted to localStorage", () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });

    fireEvent.click(screen.getByLabelText("Thu gọn thanh bên"));

    expect(localStorage.getItem("ibb_admin_sidebar")).toBe("collapsed");
  });

  it("starts collapsed when localStorage was preset to 'collapsed'", () => {
    localStorage.setItem("ibb_admin_sidebar", "collapsed");
    act(() => { _resetSidebarStore(); });

    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });

    // Button label should reflect the already-collapsed state.
    expect(screen.getByLabelText("Mở rộng thanh bên")).toBeInTheDocument();
  });
});
