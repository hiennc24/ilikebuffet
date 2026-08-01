/**
 * OrdersPage tests — list rendering, detail drawer, and the refund form gate.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { OrdersPage } from "./orders-page";

const BILL_LIST = {
  data: [
    {
      id: "bill-1",
      number: "TC01-260802-0001",
      branchId: "branch-1",
      businessDate: "2026-08-02",
      createdAt: "2026-08-02T13:05:00+07:00",
      guestCount: 2,
      totalVnd: 200_000,
      status: "COMPLETED",
      paidAt: "2026-08-02T13:06:00+07:00",
      quarantined: false,
      refunds: [],
    },
  ],
  total: 1,
};

const BILL_DETAIL = {
  ...BILL_LIST.data[0],
  lines: [{ id: "l1", ticketTypeName: "Người lớn", qty: 2, unitPriceVnd: 100_000, lineTotalVnd: 200_000 }],
  payments: [{ id: "p1", method: "CASH", amountVnd: 200_000, tenderedVnd: 250_000, changeVnd: 50_000 }],
  refunds: [],
};

function makeFetch() {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/sales/bills/bill-1")) return json(200, BILL_DETAIL);
    if (path.startsWith("/sales/bills")) return json(200, BILL_LIST);
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

describe("OrdersPage", () => {
  beforeEach(() => {
    seedAuth();
    globalThis.fetch = makeFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("renders the bill list", async () => {
    render(<OrdersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("TC01-260802-0001")).toBeTruthy());
    // Total is formatted; the status badge text ("Hoàn tất") also appears in the
    // filter <option>, so assert on the unique total instead.
    expect(screen.getByText(/200\.000/)).toBeTruthy();
  });

  it("opens the detail drawer with lines + payments and shows the refund form for a paid bill", async () => {
    render(<OrdersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("TC01-260802-0001")).toBeTruthy());

    fireEvent.click(screen.getByText("TC01-260802-0001"));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Bill TC01-260802-0001" })).toBeTruthy());
    expect(screen.getByText("Người lớn ×2")).toBeTruthy();
    // Paid bill → refund form present.
    expect(screen.getByLabelText("Số tiền hoàn")).toBeTruthy();
    expect(screen.getByLabelText("PIN quản lý")).toBeTruthy();
  });

  it("blocks a refund that exceeds the remaining amount", async () => {
    render(<OrdersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("TC01-260802-0001")).toBeTruthy());
    fireEvent.click(screen.getByText("TC01-260802-0001"));
    await waitFor(() => expect(screen.getByLabelText("Số tiền hoàn")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Số tiền hoàn"), { target: { value: "999999" } });
    fireEvent.change(screen.getByLabelText("Lý do"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("Mã quản lý"), { target: { value: "mgr-1" } });
    fireEvent.change(screen.getByLabelText("PIN quản lý"), { target: { value: "123456" } });
    fireEvent.click(screen.getByText("Xác nhận hoàn tiền"));

    expect(screen.getByText("Vượt quá số tiền còn có thể hoàn")).toBeTruthy();
  });
});
