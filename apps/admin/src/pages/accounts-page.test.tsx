/**
 * AccountsPage tests — list + create with group/flow/threshold.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { AccountsPage } from "./accounts-page";

const GROUPS = [{ id: "g1", name: "Chi phí vận hành" }];
const ACCOUNTS = {
  data: [{ id: "a1", name: "Tiền điện", groupId: "g1", flow: "EXPENSE", approvalThresholdVnd: 5_000_000, group: { name: "Chi phí vận hành" } }],
  total: 1,
};

function makeFetch(calls: { method: string; path: string; body: unknown }[] = []) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const method = init?.method ?? "GET";
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/master-data/accounts/groups")) return json(200, GROUPS);
    if (path.startsWith("/master-data/accounts") && method === "POST") {
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      return json(201, { ...ACCOUNTS.data[0], id: "new" });
    }
    if (path.startsWith("/master-data/accounts")) return json(200, ACCOUNTS);
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

describe("AccountsPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lists accounts with flow + threshold", async () => {
    globalThis.fetch = makeFetch();
    render(<AccountsPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Tiền điện")).toBeTruthy());
    expect(screen.getByText(/5\.000\.000/)).toBeTruthy();
  });

  it("creates an account with group + flow + integer threshold", async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    globalThis.fetch = makeFetch(calls);
    render(<AccountsPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Tiền điện")).toBeTruthy());

    fireEvent.click(screen.getByText("Tài khoản mới"));
    fireEvent.change(screen.getByLabelText("Tên *"), { target: { value: "Tiền nước" } });
    fireEvent.change(screen.getByLabelText("Ngưỡng duyệt (VND, 0 = không)"), { target: { value: "2000000" } });
    fireEvent.click(screen.getByText("Lưu"));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ name: "Tiền nước", groupId: "g1", flow: "EXPENSE", approvalThresholdVnd: 2_000_000 });
  });
});
