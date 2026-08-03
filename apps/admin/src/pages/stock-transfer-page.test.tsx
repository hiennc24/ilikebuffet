/**
 * StockTransferPage tests — list rendering + create dialog submit.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { StockTransferPage } from "./stock-transfer-page";

const LIST = {
  data: [
    {
      id: "tr-1",
      code: "TR-CN01-0001",
      fromBranchCode: "CN01",
      toBranchCode: "CN02",
      note: null,
      createdAt: "2026-08-03T09:00:00+07:00",
      lines: [{ id: "l1", ingredientId: "ing-1", qtyBase: 30, unitCostVnd: 20000 }],
    },
  ],
  total: 1,
};
const BRANCHES = [{ id: "b1", code: "CN01", name: "Chi nhánh 1" }, { id: "b2", code: "CN02", name: "Chi nhánh 2" }];
const INGREDIENTS = { data: [{ id: "ing-1", name: "Bò", unit: { code: "KG" } }] };

function makeFetch() {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (init?.method === "POST" && path.startsWith("/inventory/transfers")) return json(201, { id: "tr-2", code: "TR-CN01-0002" });
    if (path.startsWith("/inventory/transfers")) return json(200, LIST);
    if (path.startsWith("/branches")) return json(200, BRANCHES);
    if (path.startsWith("/master-data/ingredients")) return json(200, INGREDIENTS);
    return json(404, {});
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

describe("StockTransferPage", () => {
  beforeEach(() => {
    seedAuth();
    globalThis.fetch = makeFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("renders the transfer list", async () => {
    render(<StockTransferPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("TR-CN01-0001")).toBeTruthy());
    expect(screen.getByText("CN01 → CN02")).toBeTruthy();
  });

  it("creates a transfer via the dialog", async () => {
    render(<StockTransferPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("TR-CN01-0001")).toBeTruthy());

    fireEvent.click(screen.getByText("Phiếu chuyển mới"));
    await waitFor(() => expect(screen.getByLabelText("Chi nhánh nguồn")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Chi nhánh nguồn"), { target: { value: "b1" } });
    fireEvent.change(screen.getByLabelText("Chi nhánh đích"), { target: { value: "b2" } });
    fireEvent.change(screen.getByLabelText("Nguyên liệu 1"), { target: { value: "ing-1" } });
    fireEvent.change(screen.getByLabelText("Số lượng 1"), { target: { value: "30" } });
    fireEvent.click(screen.getByText("Tạo phiếu"));

    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === "POST" && String(c[0]).includes("/inventory/transfers")),
      ).toBe(true),
    );
  });
});
