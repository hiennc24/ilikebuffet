/**
 * ChainDashboardPage tests — chain totals KPIs + ranked per-branch table.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { ChainDashboardPage } from "./chain-dashboard-page";

const OVERVIEW = {
  totals: { netRevenueVnd: 650_000, billCount: 3, guestCount: 12, cashVarianceVnd: -10_000, lowStockCount: 2, branchCount: 2 },
  rows: [
    { branchId: "a", code: "CN01", name: "Chi nhánh 1", netRevenueVnd: 350_000, billCount: 2, guestCount: 7, cashVarianceVnd: -10_000, lowStockCount: 1, rank: 1 },
    { branchId: "b", code: "CN02", name: "Chi nhánh 2", netRevenueVnd: 300_000, billCount: 1, guestCount: 5, cashVarianceVnd: 0, lowStockCount: 1, rank: 2 },
  ],
};

function makeFetch() {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/sales/reports/chain-overview")) return json(OVERVIEW);
    return json({});
  }) as typeof globalThis.fetch;
}

function seedAuth() {
  sessionStorage.setItem("ibb_admin_at", "at");
  sessionStorage.setItem("ibb_admin_rt", "rt");
  localStorage.setItem("ibb_admin_branch", "a");
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider apiBaseUrl="">{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("ChainDashboardPage", () => {
  beforeEach(() => {
    seedAuth();
    globalThis.fetch = makeFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("shows chain totals and the ranked per-branch table", async () => {
    render(<ChainDashboardPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Doanh thu thuần chuỗi")).toBeTruthy());
    // Chain net total.
    expect(screen.getAllByText(/650\.000/).length).toBeGreaterThanOrEqual(1);
    // Top-ranked branch row.
    expect(screen.getByText("CN01 — Chi nhánh 1")).toBeTruthy();
    expect(screen.getAllByText(/350\.000/).length).toBeGreaterThanOrEqual(1);
  });
});
