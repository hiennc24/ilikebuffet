/**
 * BankReconcilePage tests — list + manual match action.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { BankReconcilePage } from "./bank-reconcile-page";

const LIST = {
  data: [
    {
      id: "tx-1",
      gateway: "Vietcombank",
      amountVnd: 200_000,
      content: "CN01 260803 0001",
      referenceCode: "REF1",
      transferredAt: "2026-08-03T10:00:00+07:00",
      status: "UNMATCHED",
      matchedBillId: null,
      matchedBillNumber: null,
      note: null,
    },
  ],
  total: 1,
};

function makeFetch() {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (init?.method === "POST" && path.includes("/bank-transactions/tx-1/match")) return json(201, { status: "MATCHED" });
    if (path.startsWith("/sales/bank-transactions")) return json(200, LIST);
    return json(404, { error: "not found" });
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

describe("BankReconcilePage", () => {
  beforeEach(() => {
    seedAuth();
    globalThis.fetch = makeFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("renders the transaction list", async () => {
    render(<BankReconcilePage />, { wrapper });
    await waitFor(() => expect(screen.getByText("CN01 260803 0001")).toBeTruthy());
    expect(screen.getByText(/200\.000/)).toBeTruthy();
  });

  it("matches an unmatched transfer to a bill number", async () => {
    render(<BankReconcilePage />, { wrapper });
    await waitFor(() => expect(screen.getByText("CN01 260803 0001")).toBeTruthy());

    fireEvent.click(screen.getByText("CN01 260803 0001"));
    await waitFor(() => expect(screen.getByLabelText("Số bill")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Số bill"), { target: { value: "CN01-260803-0001" } });
    fireEvent.click(screen.getByText("Khớp bill"));

    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          (c) => c[1]?.method === "POST" && String(c[0]).includes("/bank-transactions/tx-1/match"),
        ),
      ).toBe(true),
    );
  });
});
