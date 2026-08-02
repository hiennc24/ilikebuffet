/**
 * PurchaseOrdersPage tests — list rendering, create dialog with a line editor
 * and running total, and the detail drawer lifecycle actions.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { PurchaseOrdersPage } from "./purchase-orders-page";

const PO_LIST = {
  data: [
    {
      id: "po-1",
      code: "PO-CN01-0001",
      branchId: "branch-1",
      supplierId: "sup-1",
      supplierName: "NCC Một",
      status: "DRAFT",
      note: null,
      createdAt: "2026-08-02T09:00:00+07:00",
      totalVnd: 900_000,
      lines: [],
    },
  ],
  total: 1,
};

const PO_DETAIL = {
  ...PO_LIST.data[0],
  lines: [
    {
      id: "l1",
      ingredientId: "ing-1",
      ingredientName: "Ba chỉ bò",
      ingredientCode: "NL001",
      unitId: "u-thung",
      unitCode: "THUNG",
      qty: 2.5,
      unitPriceVnd: 300_000,
      lineTotalVnd: 750_000,
    },
  ],
};

const SUPPLIERS = [{ id: "sup-1", name: "NCC Một", status: "ACTIVE" }];
const INGREDIENTS = {
  data: [
    {
      id: "ing-1",
      name: "Ba chỉ bò",
      code: "NL001",
      unitId: "u-kg",
      unit: { code: "KG" },
      purchaseUnits: [{ unitId: "u-thung", unit: { code: "THUNG" } }],
    },
  ],
};

function makeFetch() {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/master-data/suppliers")) return json(200, SUPPLIERS);
    if (path.startsWith("/master-data/ingredients")) return json(200, INGREDIENTS);
    if (path.startsWith("/inventory/purchase-orders/po-1")) return json(200, PO_DETAIL);
    if (path.startsWith("/inventory/purchase-orders")) return json(200, PO_LIST);
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

describe("PurchaseOrdersPage", () => {
  beforeEach(() => {
    seedAuth();
    globalThis.fetch = makeFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("renders the purchase-order list", async () => {
    render(<PurchaseOrdersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("PO-CN01-0001")).toBeTruthy());
    // "Nháp" appears in both the filter <option> and the row Badge; assert the
    // unique formatted total instead.
    expect(screen.getByText(/900\.000/)).toBeTruthy();
  });

  it("opens the create dialog with a line editor and computes a running total", async () => {
    render(<PurchaseOrdersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("PO-CN01-0001")).toBeTruthy());

    fireEvent.click(screen.getByText("Đơn mua mới"));
    // Ingredients load into the line editor.
    await waitFor(() => expect(screen.getByLabelText("Nguyên liệu 1")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Nguyên liệu 1"), { target: { value: "ing-1" } });
    fireEvent.change(screen.getByLabelText("Đơn vị 1"), { target: { value: "u-thung" } });
    fireEvent.change(screen.getByLabelText("Số lượng 1"), { target: { value: "2.5" } });
    fireEvent.change(screen.getByLabelText("Đơn giá 1"), { target: { value: "300000" } });

    // 2.5 × 300000 = 750000 shown as the line total and the grand total.
    await waitFor(() => expect(screen.getAllByText(/750\.000/).length).toBeGreaterThan(0));
  });

  it("shows lifecycle actions for a DRAFT order in the detail drawer", async () => {
    render(<PurchaseOrdersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("PO-CN01-0001")).toBeTruthy());

    fireEvent.click(screen.getByText("PO-CN01-0001"));
    await waitFor(() => expect(screen.getByText("Gửi NCC")).toBeTruthy());
    expect(screen.getByText("Huỷ đơn")).toBeTruthy();
  });
});
