/**
 * PermissionsPage tests — renders the role→capability matrix with ✓/– cells.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { PermissionsPage } from "./permissions-page";

const MATRIX = {
  roles: [
    { value: "THU_NGAN", label: "Thu ngân" },
    { value: "THU_KHO", label: "Thủ kho" },
  ],
  capabilities: ["cash:create-voucher", "purchase-order:create"],
  matrix: {
    THU_NGAN: ["cash:create-voucher"],
    THU_KHO: ["purchase-order:create"],
  },
};

function makeFetch() {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/rbac/capabilities")) return json(MATRIX);
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

describe("PermissionsPage", () => {
  beforeEach(() => {
    seedAuth();
    globalThis.fetch = makeFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("renders the matrix with role columns and capability rows", async () => {
    render(<PermissionsPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("cash:create-voucher")).toBeTruthy());
    expect(screen.getByText("Thu ngân")).toBeTruthy();
    expect(screen.getByText("Thủ kho")).toBeTruthy();
    // Cashier HAS cash:create-voucher; warehouse does NOT (aria-labels encode the cells).
    expect(screen.getByLabelText("Thu ngân có cash:create-voucher")).toBeTruthy();
    expect(screen.getByLabelText("Thủ kho không có cash:create-voucher")).toBeTruthy();
  });
});
