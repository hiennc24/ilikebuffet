/**
 * Topbar cluster tests — user menu, notifications bell, command palette, dark-mode toggle.
 *
 * Token strategy: craft a JWT-ish token whose payload segment base64-decodes to
 * `{ role, username }` so AuthContext.username and AuthContext.role are populated
 * (same pattern as purchase-orders-page.test.tsx).
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { AdminShell } from "./admin-shell";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal JWT-ish access token carrying role + username. */
function makeToken(role: string, username: string): string {
  return `h.${btoa(JSON.stringify({ role, username }))}.s`;
}

/** Stub matchMedia so compact/desktop state is predictable. */
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

function setup(opts: { role?: string; username?: string; compact?: boolean } = {}) {
  const { role = "QUAN_TRI_HQ", username = "admin@ilikebuffet.vn", compact = false } = opts;
  stubMatchMedia(compact);
  sessionStorage.setItem("ibb_admin_at", makeToken(role, username));
  sessionStorage.setItem("ibb_admin_rt", "rt");
  localStorage.setItem("ibb_admin_branch", "b1");
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ) as typeof globalThis.fetch;
}

// ── User menu ─────────────────────────────────────────────────────────────────

describe("User menu", () => {
  beforeEach(() => setup({ role: "QUAN_TRI_HQ", username: "admin@ilikebuffet.vn" }));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("opens on click and shows username", async () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    const trigger = screen.getByLabelText("Menu tài khoản");
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Menu tài khoản" })).toBeInTheDocument();
    });
    // Username appears in both the trigger button (desktop) and the dropdown — use getAllBy.
    const matches = screen.getAllByText("admin@ilikebuffet.vn");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Vietnamese role label", async () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    fireEvent.click(screen.getByLabelText("Menu tài khoản"));
    await waitFor(() => {
      expect(screen.getByText("Quản trị HQ")).toBeInTheDocument();
    });
  });

  it("calls logout when Đăng xuất is clicked", async () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    fireEvent.click(screen.getByLabelText("Menu tài khoản"));
    await waitFor(() => screen.getByRole("dialog", { name: "Menu tài khoản" }));
    // There are two logout buttons (sidebar + user menu); click the one inside the dialog.
    const dialog = screen.getByRole("dialog", { name: "Menu tài khoản" });
    const logoutBtn = dialog.querySelector("button")!;
    fireEvent.click(logoutBtn);
    // Auth state resets — sessionStorage should be cleared.
    expect(sessionStorage.getItem("ibb_admin_at")).toBeNull();
  });

  it("closes on Esc", async () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    fireEvent.click(screen.getByLabelText("Menu tài khoản"));
    await waitFor(() => screen.getByRole("dialog", { name: "Menu tài khoản" }));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Menu tài khoản" })).toBeNull();
    });
  });
});

// ── Notifications bell ────────────────────────────────────────────────────────

describe("Notifications bell", () => {
  beforeEach(() => setup());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("opens on click and shows empty state", async () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    fireEvent.click(screen.getByLabelText("Thông báo"));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Thông báo" })).toBeInTheDocument();
    });
    expect(screen.getByText("Chưa có thông báo")).toBeInTheDocument();
  });

  it("closes on Esc", async () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    fireEvent.click(screen.getByLabelText("Thông báo"));
    await waitFor(() => screen.getByRole("dialog", { name: "Thông báo" }));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Thông báo" })).toBeNull();
    });
  });
});

// ── Command palette ───────────────────────────────────────────────────────────

describe("Command palette", () => {
  beforeEach(() => setup({ role: "QUAN_TRI_HQ" }));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("opens when the search button is clicked", async () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    fireEvent.click(screen.getByLabelText("Tìm kiếm"));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Tìm kiếm và điều hướng" })).toBeInTheDocument();
    });
  });

  it("opens on Ctrl+K", async () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Tìm kiếm và điều hướng" })).toBeInTheDocument();
    });
  });

  it("filters nav items by typed text", async () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    fireEvent.click(screen.getByLabelText("Tìm kiếm"));
    const dialog = await waitFor(() =>
      screen.getByRole("dialog", { name: "Tìm kiếm và điều hướng" }),
    );

    const input = within(dialog).getByPlaceholderText("Tìm kiếm…");
    fireEvent.change(input, { target: { value: "doanh thu" } });

    await waitFor(() => {
      // "Doanh thu" item should appear inside the palette results (listbox).
      const listbox = within(dialog).getByRole("listbox");
      expect(within(listbox).getByText("Doanh thu")).toBeInTheDocument();
      // Unrelated items should not appear in the palette.
      expect(within(listbox).queryByText("Nhân sự")).toBeNull();
    });
  });

  it("navigates on Enter key", async () => {
    const onNavigate = vi.fn();
    render(
      <AdminShell pageTitle="Test" onNavigate={onNavigate}><div /></AdminShell>,
      { wrapper },
    );
    fireEvent.click(screen.getByLabelText("Tìm kiếm"));
    const dialog = await waitFor(() =>
      screen.getByRole("dialog", { name: "Tìm kiếm và điều hướng" }),
    );

    const input = within(dialog).getByPlaceholderText("Tìm kiếm…");
    fireEvent.change(input, { target: { value: "doanh thu" } });

    // Wait until the palette result appears in the listbox.
    const listbox = within(dialog).getByRole("listbox");
    await waitFor(() => within(listbox).getAllByText("Doanh thu").length > 0);

    // First result is highlighted (index 0); press Enter to navigate.
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith("/reports/revenue");
    });
  });

  it("navigates on item click", async () => {
    const onNavigate = vi.fn();
    render(
      <AdminShell pageTitle="Test" onNavigate={onNavigate}><div /></AdminShell>,
      { wrapper },
    );
    fireEvent.click(screen.getByLabelText("Tìm kiếm"));
    const dialog = await waitFor(() =>
      screen.getByRole("dialog", { name: "Tìm kiếm và điều hướng" }),
    );

    const input = within(dialog).getByPlaceholderText("Tìm kiếm…");
    fireEvent.change(input, { target: { value: "doanh thu" } });

    // Wait for the palette result "Doanh thu" inside the listbox.
    const listbox = within(dialog).getByRole("listbox");
    await waitFor(() => within(listbox).getByText("Doanh thu"));

    // Click the result row (the listitem, not a span that might match elsewhere).
    const result = within(listbox).getByRole("option", { name: /doanh thu/i });
    fireEvent.click(result);
    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith("/reports/revenue");
    });
  });

  it("closes on Esc", async () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    fireEvent.click(screen.getByLabelText("Tìm kiếm"));
    await waitFor(() => screen.getByRole("dialog", { name: "Tìm kiếm và điều hướng" }));

    const input = screen.getByPlaceholderText("Tìm kiếm…");
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Tìm kiếm và điều hướng" })).toBeNull();
    });
  });
});

// ── Dark-mode toggle ──────────────────────────────────────────────────────────

describe("Dark-mode toggle", () => {
  beforeEach(() => {
    setup();
    delete document.documentElement.dataset.theme;
    localStorage.removeItem("ibb_admin_theme");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("flips document.documentElement.dataset.theme and persists to localStorage on click", async () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });
    const toggle = screen.getByLabelText(/chế độ (tối|sáng)/i);

    // Capture state before click so we can assert the transition direction.
    const beforeDark = document.documentElement.dataset.theme === "dark";
    const expectedAfter = !beforeDark;

    fireEvent.click(toggle);

    await waitFor(() => {
      const nowDark = document.documentElement.dataset.theme === "dark";
      expect(nowDark).toBe(expectedAfter);
      expect(localStorage.getItem("ibb_admin_theme")).toBe(expectedAfter ? "dark" : "light");
    });
  });

  it("toggles state on second click and localStorage stays consistent with DOM", async () => {
    render(<AdminShell pageTitle="Test"><div /></AdminShell>, { wrapper });

    // First click — record what state we move to.
    fireEvent.click(screen.getByLabelText(/chế độ (tối|sáng)/i));
    let afterFirstDark: boolean;
    await waitFor(() => {
      afterFirstDark = document.documentElement.dataset.theme === "dark";
      expect(localStorage.getItem("ibb_admin_theme")).toBe(afterFirstDark ? "dark" : "light");
    });

    // Second click — must flip.
    fireEvent.click(screen.getByLabelText(/chế độ (tối|sáng)/i));
    await waitFor(() => {
      const nowDark = document.documentElement.dataset.theme === "dark";
      // Must have flipped from afterFirstDark.
      expect(nowDark).toBe(!afterFirstDark!);
      expect(localStorage.getItem("ibb_admin_theme")).toBe(nowDark ? "dark" : "light");
    });
  });
});
