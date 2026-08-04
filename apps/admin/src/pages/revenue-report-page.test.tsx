/**
 * RevenueReportPage tests — KPIs + grouped table + groupBy param.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/auth-context";
import { RevenueReportPage } from "./revenue-report-page";

const REPORT = {
  groupBy: "day",
  totals: { grossVnd: 700_000, refundedVnd: 50_000, netVnd: 650_000, billCount: 3, cancelledCount: 1, guestCount: 7 },
  rows: [{ key: "2026-08-01", grossVnd: 700_000, refundedVnd: 50_000, netVnd: 650_000, billCount: 3, guestCount: 7 }],
  byTicketType: [{ ticketTypeId: "tt1", name: "Người lớn", qty: 5, grossVnd: 700_000 }],
};

function makeFetch(seen: string[] = []) {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    seen.push(path);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/sales/reports/revenue")) return json(REPORT);
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

describe("RevenueReportPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("shows net KPI + grouped row", async () => {
    globalThis.fetch = makeFetch();
    render(<RevenueReportPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Bill huỷ")).toBeTruthy());
    expect(screen.getAllByText(/650\.000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Người lớn")).toBeTruthy();
  });

  it("passes groupBy to the request", async () => {
    const seen: string[] = [];
    globalThis.fetch = makeFetch(seen);
    render(<RevenueReportPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Bill huỷ")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Nhóm theo"), { target: { value: "branch" } });
    await waitFor(() => expect(seen.some((p) => p.includes("groupBy=branch"))).toBe(true));
  });
});
