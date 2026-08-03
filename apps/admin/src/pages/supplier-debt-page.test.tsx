/**
 * SupplierDebtPage tests — list + pay dialog submit.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { SupplierDebtPage } from "./supplier-debt-page";

const ACCOUNTS = [{ id: "acc-1", name: "Thanh toán NCC", flow: "EXPENSE", approvalThresholdVnd: 0 }];
const LIST = {
  data: [{ id: "p1", supplierName: "NCC Một", amountVnd: 1_000_000, paidVnd: 400_000, outstandingVnd: 600_000, status: "OPEN", dueDate: "2026-08-01", overdue: true }],
  total: 1,
};

function makeFetch() {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (init?.method === "POST" && path.includes("/payables/p1/pay")) return json({ id: "p1", status: "PAID" });
    if (path.startsWith("/sales/finance/payables")) return json(LIST);
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
    <QueryClientProvider client={qc}>
      <AuthProvider apiBaseUrl="">{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("SupplierDebtPage", () => {
  beforeEach(() => {
    seedAuth();
    globalThis.fetch = makeFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lists payables with outstanding", async () => {
    render(<SupplierDebtPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("NCC Một")).toBeTruthy());
    expect(screen.getAllByText(/600\.000/).length).toBeGreaterThanOrEqual(1);
  });

  it("pays a payable via the dialog", async () => {
    render(<SupplierDebtPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("NCC Một")).toBeTruthy());

    fireEvent.click(screen.getByText("NCC Một"));
    await waitFor(() => expect(screen.getByLabelText("Số tiền trả")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Tài khoản chi"), { target: { value: "acc-1" } });
    fireEvent.click(screen.getByText("Thanh toán"));

    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === "POST" && String(c[0]).includes("/payables/p1/pay")),
      ).toBe(true),
    );
  });
});
