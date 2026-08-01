/**
 * OfflineReconPage tests — quarantine list + resolve, and number-gaps.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { OfflineReconPage } from "./offline-recon-page";

const QUARANTINE = {
  data: [{ id: "b1", number: "OF-4", tempNumber: "T-4", branchId: "br1", businessDate: "2026-08-01", totalVnd: 100_000, quarantineReason: "clock_skew", quarantineResolvedAt: null, quarantineResolveNote: null }],
  total: 1,
};
const GAPS = { branchId: "br1", businessDate: "2026-08-01", min: 1, max: 4, missing: [3] };

// A JWT whose payload carries a chain-wide role, so the page shows the branch select.
const roleToken = () => `h.${btoa(JSON.stringify({ role: "QUAN_TRI_HQ" })).replace(/\+/g, "-").replace(/\//g, "_")}.s`;

function makeFetch(calls: string[] = []) {
  return vi.fn(async (url: string, _init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (path.includes("/resolve")) {
      calls.push(path);
      return json({ id: "b1", quarantineResolvedAt: "now" });
    }
    if (path.startsWith("/sales/reports/quarantine")) return json(QUARANTINE);
    if (path.startsWith("/sales/reports/number-gaps")) return json(GAPS);
    if (path.startsWith("/branches")) return json({ data: [{ id: "br1", code: "CN01" }] });
    return json({});
  }) as typeof globalThis.fetch;
}

function seedAuth() {
  sessionStorage.setItem("ibb_admin_at", roleToken());
  sessionStorage.setItem("ibb_admin_rt", "rt");
  localStorage.setItem("ibb_admin_branch", "br1");
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider apiBaseUrl="">{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("OfflineReconPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lists quarantined bills and resolves one", async () => {
    const calls: string[] = [];
    globalThis.fetch = makeFetch(calls);
    render(<OfflineReconPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("OF-4")).toBeTruthy());

    fireEvent.click(screen.getByText("OF-4"));
    await waitFor(() => expect(screen.getByText("Đánh dấu đã xử lý")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Ghi chú xử lý"), { target: { value: "ok" } });
    fireEvent.click(screen.getByText("Đánh dấu đã xử lý"));

    await waitFor(() => expect(calls.some((p) => p.includes("/quarantine/b1/resolve"))).toBe(true));
  });

  it("detects missing bill numbers after choosing a branch", async () => {
    globalThis.fetch = makeFetch();
    render(<OfflineReconPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("OF-4")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Chi nhánh"), { target: { value: "br1" } });
    await waitFor(() => expect(screen.getByText(/Seq thiếu: 3/)).toBeTruthy());
  });
});
