/**
 * GrossMarginReportPage tests — KPIs + grouped table + groupBy param.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/auth-context";
import { GrossMarginReportPage } from "./gross-margin-report-page";

const REPORT = {
  groupBy: "day",
  totals: { netRevenueVnd: 650_000, cogsVnd: 130_000, grossProfitVnd: 520_000, marginPct: 80 },
  rows: [{ key: "2026-08-01", netRevenueVnd: 650_000, cogsVnd: 130_000, grossProfitVnd: 520_000, marginPct: 80 }],
};

function makeFetch(seen: string[] = []) {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    seen.push(path);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/sales/reports/gross-margin")) return json(REPORT);
    if (path.startsWith("/inventory/reports/fifo-cogs")) return json({ totalCogsVnd: 111_000, byDay: [] });
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

describe("GrossMarginReportPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("shows margin KPIs + grouped row", async () => {
    globalThis.fetch = makeFetch();
    render(<GrossMarginReportPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("%Biên gộp")).toBeTruthy());
    expect(screen.getAllByText(/520\.000/).length).toBeGreaterThanOrEqual(1);
    // 80% margin appears in both the KPI and the row.
    expect(screen.getAllByText(/80\.0%/).length).toBeGreaterThanOrEqual(1);
    // FIFO actual-cost KPI loads alongside the moving-average estimate.
    await waitFor(() => expect(screen.getByText(/111\.000/)).toBeTruthy());
    expect(screen.getByText("Giá vốn (FIFO thực tế)")).toBeTruthy();
  });

  it("passes groupBy to the request", async () => {
    const seen: string[] = [];
    globalThis.fetch = makeFetch(seen);
    render(<GrossMarginReportPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("%Biên gộp")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Nhóm theo"), { target: { value: "branch" } });
    await waitFor(() =>
      expect(seen.some((p) => p.startsWith("/sales/reports/gross-margin") && p.includes("groupBy=branch"))).toBe(true),
    );
  });
});
