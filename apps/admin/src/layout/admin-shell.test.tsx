/**
 * AdminShell responsive tests — hamburger + drawer below the desktop breakpoint,
 * fixed sidebar (no hamburger) at desktop width.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { AdminShell } from "./admin-shell";

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
});
