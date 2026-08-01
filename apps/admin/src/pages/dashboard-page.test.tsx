/**
 * DashboardPage tests — today KPIs.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { DashboardPage } from "./dashboard-page";

const DASH = { date: "2026-08-02", todayNetVnd: 650_000, todayBillCount: 3, todayGuestCount: 7, openShiftCount: 2, quarantineOpenCount: 1 };

function makeFetch() {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/sales/reports/dashboard")) return json(DASH);
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

describe("DashboardPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("shows today KPIs", async () => {
    globalThis.fetch = makeFetch();
    render(<DashboardPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Doanh thu thuần hôm nay")).toBeTruthy());
    expect(screen.getByText(/650\.000/)).toBeTruthy();
    expect(screen.getByText("Ca đang mở")).toBeTruthy();
    expect(screen.getByText("Bill cách ly chờ xử lý")).toBeTruthy();
  });
});
