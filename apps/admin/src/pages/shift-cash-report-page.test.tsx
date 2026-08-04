/**
 * ShiftCashReportPage tests — KPIs + variance rows.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/auth-context";
import { ShiftCashReportPage } from "./shift-cash-report-page";

const REPORT = {
  totals: { varianceVnd: -10_000, shortCount: 1, overCount: 0, shiftCount: 2 },
  rows: [
    { shiftId: "s1", branchId: "b1", businessDate: "2026-08-01", expectedCashVnd: 400_000, countedCashVnd: 390_000, varianceVnd: -10_000, varianceNote: "thiếu", cashRevenueVnd: 200_000 },
    { shiftId: "s2", branchId: "b2", businessDate: "2026-08-01", expectedCashVnd: 300_000, countedCashVnd: 300_000, varianceVnd: 0, varianceNote: null, cashRevenueVnd: 300_000 },
  ],
};

function makeFetch() {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/sales/reports/shift-cash")) return json(REPORT);
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

describe("ShiftCashReportPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("shows variance KPI + rows", async () => {
    globalThis.fetch = makeFetch();
    render(<ShiftCashReportPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Ca thiếu")).toBeTruthy());
    // variance -10.000 rendered as a warn badge in the row
    expect(screen.getAllByText(/-10\.000/).length).toBeGreaterThanOrEqual(1);
  });
});
