/**
 * StockPage tests — balance list, drawer history, and the issue action.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { StockPage } from "./stock-page";

const STOCK_LIST = {
  data: [
    {
      branchId: "branch-1",
      ingredientId: "ing-1",
      ingredientName: "Ba chỉ bò",
      ingredientCode: "NL001",
      unitCode: "KG",
      qtyBase: 65,
      avgCostVnd: 20_000,
      valueVnd: 1_300_000,
      minStock: 50,
      lowStock: false,
    },
  ],
  total: 1,
};

const MOVEMENTS = {
  data: [
    { id: "m1", ingredientName: "Ba chỉ bò", unitCode: "KG", type: "ISSUE", qtyBase: -5, unitCostVnd: 20_000, note: "hao", refType: null, createdAt: "2026-08-02T09:00:00+07:00" },
  ],
};

function makeFetch() {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/inventory/reports/valuation")) return json(200, { totalValueVnd: 1_302_000, itemCount: 2, lowStockCount: 1 });
    if (path.startsWith("/inventory/movements")) return json(200, MOVEMENTS);
    if (path.startsWith("/inventory/stock/issue")) return json(201, { qtyBase: 63, avgCostVnd: 20_000 });
    if (path.startsWith("/inventory/stock")) return json(200, STOCK_LIST);
    return json(404, { error: "not found" });
  }) as typeof globalThis.fetch;
}

function seedAuth() {
  sessionStorage.setItem("ibb_admin_at", "at");
  sessionStorage.setItem("ibb_admin_rt", "rt");
  localStorage.setItem("ibb_admin_branch", "branch-1");
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider apiBaseUrl="">{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("StockPage", () => {
  beforeEach(() => {
    seedAuth();
    globalThis.fetch = makeFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("renders the valuation KPIs and the stock list with value", async () => {
    render(<StockPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Ba chỉ bò")).toBeTruthy());
    expect(screen.getByText(/1\.300\.000/)).toBeTruthy();
    // Valuation KPI card total.
    await waitFor(() => expect(screen.getByText(/1\.302\.000/)).toBeTruthy());
    expect(screen.getByText("Tồn thấp")).toBeTruthy();
  });

  it("opens the drawer and issues stock with a reason", async () => {
    render(<StockPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Ba chỉ bò")).toBeTruthy());

    fireEvent.click(screen.getByText("Ba chỉ bò"));
    await waitFor(() => expect(screen.getByText("Xuất kho")).toBeTruthy());

    fireEvent.click(screen.getByText("Xuất kho"));
    await waitFor(() => expect(screen.getByLabelText("Số lượng xuất")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Số lượng xuất"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Lý do"), { target: { value: "hao hụt" } });
    fireEvent.click(screen.getByText("Xác nhận"));

    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]).includes("/inventory/stock/issue")),
      ).toBe(true),
    );
  });
});
