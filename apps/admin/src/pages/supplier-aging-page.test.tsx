/**
 * SupplierAgingPage tests — aging buckets + KPIs + due-soon list.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { SupplierAgingPage } from "./supplier-aging-page";

const AGING = {
  totals: { notDueVnd: 150_000, d1_30Vnd: 900_000, d31_60Vnd: 300_000, d60plusVnd: 400_000, totalOutstandingVnd: 1_750_000, supplierCount: 2 },
  suppliers: [
    { supplierId: "s-a", supplierName: "NCC A", notDueVnd: 150_000, d1_30Vnd: 200_000, d31_60Vnd: 300_000, d60plusVnd: 400_000, totalOutstandingVnd: 1_050_000 },
    { supplierId: "s-b", supplierName: "NCC B", notDueVnd: 0, d1_30Vnd: 700_000, d31_60Vnd: 0, d60plusVnd: 0, totalOutstandingVnd: 700_000 },
  ],
};
const DUE_SOON = {
  items: [{ id: "p1", supplierName: "NCC A", outstandingVnd: 400_000, dueDate: "2026-05-05", daysOverdue: 90 }],
  total: 1,
};

function makeFetch() {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/sales/finance/payables/aging")) return json(AGING);
    if (path.startsWith("/sales/finance/payables/due-soon")) return json(DUE_SOON);
    if (path.startsWith("/branches")) return json({ data: [] });
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

describe("SupplierAgingPage", () => {
  beforeEach(() => {
    seedAuth();
    globalThis.fetch = makeFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("shows aging KPIs + supplier bucket rows", async () => {
    render(<SupplierAgingPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Tổng công nợ")).toBeTruthy());
    expect(screen.getAllByText("NCC A").length).toBeGreaterThanOrEqual(1);
    // overdue KPI = 900k + 300k + 400k = 1.600.000
    expect(screen.getAllByText(/1\.600\.000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1\.750\.000/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows the due-soon list with an overdue badge", async () => {
    render(<SupplierAgingPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Quá 90 ngày")).toBeTruthy());
  });
});
