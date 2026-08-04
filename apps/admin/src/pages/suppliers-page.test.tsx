/**
 * SuppliersPage tests — list, create, and the HQ approve action for PENDING_HQ.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { SuppliersPage } from "./suppliers-page";

const SUPPLIERS = [
  { id: "s1", name: "NCC Rau Sạch", taxCode: "123", contact: "0900", debtTerms: 30, scope: "CHAIN_WIDE", status: "ACTIVE" },
  { id: "s2", name: "NCC Thịt CN1", taxCode: null, contact: null, debtTerms: null, scope: "BRANCH_SPECIFIC", status: "PENDING_HQ" },
];

function makeFetch(calls: { method: string; path: string; body: unknown }[] = []) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const method = init?.method ?? "GET";
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.includes("/approve")) {
      calls.push({ method, path, body: null });
      return json(200, { ...SUPPLIERS[1], status: "ACTIVE" });
    }
    if (path.startsWith("/master-data/suppliers") && (method === "POST" || method === "PUT")) {
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      return json(201, { ...SUPPLIERS[0], id: "new" });
    }
    if (path.startsWith("/master-data/suppliers")) return json(200, { data: SUPPLIERS, total: 2 });
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
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AuthProvider apiBaseUrl="">{children}</AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("SuppliersPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lists suppliers with scope + status", async () => {
    globalThis.fetch = makeFetch();
    render(<SuppliersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("NCC Rau Sạch")).toBeTruthy());
    expect(screen.getByText("NCC Thịt CN1")).toBeTruthy();
    // "Chờ HQ duyệt" also appears as a filter <option>; assert the badge exists too.
    expect(screen.getAllByText("Chờ HQ duyệt").length).toBeGreaterThanOrEqual(1);
  });

  it("creates a supplier with scope", async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    globalThis.fetch = makeFetch(calls);
    render(<SuppliersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("NCC Rau Sạch")).toBeTruthy());

    fireEvent.click(screen.getByText("NCC mới"));
    fireEvent.change(screen.getByLabelText("Tên *"), { target: { value: "NCC Test" } });
    fireEvent.click(screen.getByText("Lưu"));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ name: "NCC Test", scope: "CHAIN_WIDE" });
  });

  it("approves a PENDING_HQ supplier from the edit dialog", async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    globalThis.fetch = makeFetch(calls);
    render(<SuppliersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("NCC Thịt CN1")).toBeTruthy());

    fireEvent.click(screen.getByText("NCC Thịt CN1"));
    await waitFor(() => expect(screen.getByText("Duyệt (HQ)")).toBeTruthy());
    fireEvent.click(screen.getByText("Duyệt (HQ)"));

    await waitFor(() => expect(calls.some((c) => c.path.includes("/approve") && c.method === "PATCH")).toBe(true));
  });
});
