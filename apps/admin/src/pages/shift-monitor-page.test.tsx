/**
 * ShiftMonitorPage — polls the selected open shift's summary (BH-08).
 */

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { ShiftMonitorPage } from "./shift-monitor-page";

const OPEN_SHIFTS = [{ id: "shift-1", deviceId: "POS-01", openedAt: "2026-08-01T10:00:00+07:00" }];
const SUMMARY = {
  shiftId: "shift-1",
  status: "OPEN",
  billCount: 12,
  cancelledCount: 1,
  revenueVnd: 3_588_000,
  guestCount: 30,
  ticketsByType: [{ ticketTypeId: "tt-1", name: "Người lớn", qty: 24 }],
  last30mBills: 5,
};

function makeFetch() {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/sales/shifts/shift-1/summary")) return json(SUMMARY);
    if (path.startsWith("/sales/shifts")) return json(OPEN_SHIFTS);
    return json([]);
  }) as typeof globalThis.fetch;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider apiBaseUrl="">{children}</AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  sessionStorage.setItem("ibb_admin_at", "at");
  sessionStorage.setItem("ibb_admin_rt", "rt");
  localStorage.setItem("ibb_admin_branch", "branch-1");
  globalThis.fetch = makeFetch();
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe("ShiftMonitorPage", () => {
  it("auto-selects the open shift and renders its live summary", async () => {
    render(<ShiftMonitorPage />, { wrapper: Wrapper });

    // Revenue + tickets-by-type from the summary appear.
    await waitFor(() => expect(screen.getByText(/3\.588\.000/)).toBeTruthy());
    expect(screen.getByText("Người lớn")).toBeTruthy();
    expect(screen.getByText("24")).toBeTruthy();
    expect(screen.getByText("5 bill")).toBeTruthy(); // 30-min pace
  });
});
