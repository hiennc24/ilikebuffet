/**
 * PurchaseOrdersPage tests — list rendering, create dialog with a line editor
 * and running total, and the detail drawer lifecycle actions.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
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
    {
      id: "po-2",
      code: "PO-CN01-0002",
      branchId: "branch-1",
      supplierId: "sup-1",
      supplierName: "NCC Một",
      status: "SENT",
      note: null,
      createdAt: "2026-08-02T10:00:00+07:00",
      totalVnd: 500_000,
      lines: [],
    },
  ],
  total: 2,
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

const PO_SENT_DETAIL = {
  ...PO_DETAIL,
  id: "po-2",
  code: "PO-CN01-0002",
  status: "SENT",
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
    if (path.includes("/inventory/purchase-orders/po-2/receive")) return json(201, { poId: "po-2", status: "RECEIVED", received: [] });
    if (path.startsWith("/inventory/purchase-orders/po-2")) return json(200, PO_SENT_DETAIL);
    if (path.startsWith("/inventory/purchase-orders/po-1")) return json(200, PO_DETAIL);
    if (path.startsWith("/inventory/purchase-orders")) return json(200, PO_LIST);
    return json(404, { error: "not found" });
  }) as typeof globalThis.fetch;
}

function seedAuth(role?: string) {
  // decodeRole reads the JWT payload (2nd segment) — craft one carrying `role`.
  const at = role ? `h.${btoa(JSON.stringify({ role }))}.s` : "at";
  sessionStorage.setItem("ibb_admin_at", at);
  sessionStorage.setItem("ibb_admin_rt", "rt");
  localStorage.setItem("ibb_admin_branch", "branch-1");
}

/** A fetch that returns the given DRAFT/APPROVED detail for po-1. */
function makeApprovalFetch(detail: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (init?.method === "POST" && path.includes("/inventory/purchase-orders/po-1/")) return json(201, { ...detail, status: "APPROVED" });
    if (path.startsWith("/master-data/suppliers")) return json(200, SUPPLIERS);
    if (path.startsWith("/inventory/purchase-orders/po-1")) return json(200, detail);
    if (path.startsWith("/inventory/purchase-orders")) return json(200, { data: [detail], total: 1 });
    return json(404, { error: "not found" });
  }) as typeof globalThis.fetch;
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

  it("opens the receive dialog for a SENT order and submits actual quantities", async () => {
    render(<PurchaseOrdersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("PO-CN01-0002")).toBeTruthy());

    fireEvent.click(screen.getByText("PO-CN01-0002"));
    await waitFor(() => expect(screen.getByText("Nhập kho")).toBeTruthy());

    fireEvent.click(screen.getByText("Nhập kho"));
    // Receive dialog pre-fills the ordered line for editing.
    await waitFor(() => expect(screen.getByLabelText("Số lượng nhận 1")).toBeTruthy());
    // Ingredient name shows in both the drawer's line list and the receive dialog.
    expect(screen.getAllByText(/Ba chỉ bò/).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Số lượng nhận 1"), { target: { value: "2" } });
    fireEvent.click(screen.getByText("Xác nhận nhập"));

    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) =>
          String(c[0]).includes("/inventory/purchase-orders/po-2/receive"),
        ),
      ).toBe(true),
    );
  });

  it("lets an approver approve an over-threshold DRAFT order", async () => {
    seedAuth("QUAN_LY_CN");
    const draft = { ...PO_DETAIL, needsApproval: true, status: "DRAFT" };
    globalThis.fetch = makeApprovalFetch(draft);

    render(<PurchaseOrdersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("PO-CN01-0001")).toBeTruthy());
    fireEvent.click(screen.getByText("PO-CN01-0001"));

    await waitFor(() => expect(screen.getByText("Duyệt")).toBeTruthy());
    // Over-threshold: no direct "Gửi NCC" until approved.
    expect(screen.queryByText("Gửi NCC")).toBeNull();

    fireEvent.click(screen.getByText("Duyệt"));
    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          (c) => (c[1] as RequestInit | undefined)?.method === "POST" && String(c[0]).includes("/po-1/approve"),
        ),
      ).toBe(true),
    );
  });

  it("shows send + reject for an APPROVED order to an approver", async () => {
    seedAuth("QUAN_LY_CN");
    const approved = { ...PO_DETAIL, needsApproval: true, status: "APPROVED", approvedBy: "mgr-1" };
    globalThis.fetch = makeApprovalFetch(approved);

    render(<PurchaseOrdersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("PO-CN01-0001")).toBeTruthy());
    fireEvent.click(screen.getByText("PO-CN01-0001"));

    await waitFor(() => expect(screen.getByText("Gửi NCC")).toBeTruthy());
    expect(screen.getByText("Từ chối")).toBeTruthy();
  });

  it("hides approve/send from a non-approver on an over-threshold DRAFT", async () => {
    seedAuth("THU_KHO");
    const draft = { ...PO_DETAIL, needsApproval: true, status: "DRAFT" };
    globalThis.fetch = makeApprovalFetch(draft);

    render(<PurchaseOrdersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("PO-CN01-0001")).toBeTruthy());
    fireEvent.click(screen.getByText("PO-CN01-0001"));

    await waitFor(() => expect(screen.getByText(/cần quản lý duyệt/i)).toBeTruthy());
    expect(screen.queryByText("Duyệt")).toBeNull();
    expect(screen.queryByText("Gửi NCC")).toBeNull();
  });
});
