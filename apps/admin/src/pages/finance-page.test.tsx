/**
 * FinancePage tests — KPI totals + list, and the over-threshold PIN fields.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/auth-context";
import { FinancePage } from "./finance-page";

const ACCOUNTS = [
  { id: "acc-1", name: "Điện nước", flow: "EXPENSE", approvalThresholdVnd: 1_000_000 },
  { id: "acc-2", name: "Thu khác", flow: "INCOME", approvalThresholdVnd: 0 },
];
const LIST = {
  data: [{ id: "t1", code: "TC-CN01-0001", accountId: "acc-1", accountName: "Điện nước", flow: "EXPENSE", amountVnd: 500_000, method: "CASH", occurredAt: "2026-08-03T00:00:00Z", note: null, approvedBy: null }],
  total: 1,
  totals: { incomeVnd: 0, expenseVnd: 500_000, netVnd: -500_000 },
};
const SUMMARY = { rows: [], totals: { incomeVnd: 0, expenseVnd: 500_000, netVnd: -500_000 } };

function makeFetch() {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (init?.method === "POST" && path.startsWith("/sales/finance")) return json({ id: "t2", code: "TC-CN01-0002" });
    if (path.startsWith("/sales/finance/summary")) return json(SUMMARY);
    if (path.startsWith("/sales/finance")) return json(LIST);
    if (path.startsWith("/master-data/accounts")) return json(ACCOUNTS);
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

describe("FinancePage", () => {
  beforeEach(() => {
    seedAuth();
    globalThis.fetch = makeFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("shows KPI totals and the entry list", async () => {
    render(<FinancePage />, { wrapper });
    await waitFor(() => expect(screen.getByText("TC-CN01-0001")).toBeTruthy());
    expect(screen.getByText("Tổng chi")).toBeTruthy();
    expect(screen.getAllByText(/500\.000/).length).toBeGreaterThanOrEqual(1);
  });

  it("reveals manager PIN fields when the amount exceeds the account threshold", async () => {
    render(<FinancePage />, { wrapper });
    await waitFor(() => expect(screen.getByText("TC-CN01-0001")).toBeTruthy());

    fireEvent.click(screen.getByText("Phiếu mới"));
    await waitFor(() => expect(screen.getByLabelText("Số tiền")).toBeTruthy());

    // Account acc-1 threshold 1M; enter 2M → PIN fields appear.
    fireEvent.change(screen.getByLabelText("Tài khoản phiếu"), { target: { value: "acc-1" } });
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "2000000" } });
    await waitFor(() => expect(screen.getByLabelText("PIN quản lý")).toBeTruthy());
  });
});
