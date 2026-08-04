/**
 * PnlReportPage tests — KPIs + grouped table + groupBy param.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { PnlReportPage } from "./pnl-report-page";

const REPORT = {
  groupBy: "day",
  totals: { netRevenueVnd: 650_000, cogsVnd: 130_000, grossProfitVnd: 520_000, opexVnd: 70_000, netProfitVnd: 450_000, marginPct: 69.2 },
  rows: [{ key: "2026-08-01", netRevenueVnd: 650_000, cogsVnd: 130_000, grossProfitVnd: 520_000, opexVnd: 70_000, netProfitVnd: 450_000, marginPct: 69.2 }],
};

function makeFetch(seen: string[] = []) {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    seen.push(path);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/sales/reports/pnl")) return json(REPORT);
    if (path.startsWith("/branches")) return json({ data: [{ id: "b1", code: "CN01" }] });
    return json({});
  }) as typeof globalThis.fetch;
}

function seedAuth() {
  sessionStorage.setItem("ibb_admin_at", "at");
  sessionStorage.setItem("ibb_admin_rt", "rt");
  localStorage.setItem("ibb_admin_branch", "b1");
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AuthProvider apiBaseUrl="">{children}</AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("PnlReportPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("shows P&L KPIs + grouped row", async () => {
    globalThis.fetch = makeFetch();
    render(<PnlReportPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByText(/450\.000/).length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText(/70\.000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/69\.2%/).length).toBeGreaterThanOrEqual(1);
  });

  it("passes groupBy to the request", async () => {
    const seen: string[] = [];
    globalThis.fetch = makeFetch(seen);
    render(<PnlReportPage />, { wrapper });
    await waitFor(() => expect(screen.getByLabelText("Nhóm theo")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Nhóm theo"), { target: { value: "branch" } });
    await waitFor(() =>
      expect(seen.some((p) => p.startsWith("/sales/reports/pnl") && p.includes("groupBy=branch"))).toBe(true),
    );
  });
});
