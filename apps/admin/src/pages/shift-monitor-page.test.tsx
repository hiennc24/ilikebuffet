/**
 * ShiftMonitorPage — polls the selected open shift's summary.
 *
 * Additional coverage:
 *   When the polled shift list no longer contains the selected shiftId
 *         (shift just closed), the page resets selection instead of showing
 *         a permanent loading spinner.
 */

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <AuthProvider apiBaseUrl="">{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
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
    render(<ShiftMonitorPage />, { wrapper: makeWrapper() });

    // Revenue + tickets-by-type from the summary appear.
    await waitFor(() => expect(screen.getByText(/3\.588\.000/)).toBeTruthy());
    expect(screen.getByText("Người lớn")).toBeTruthy();
    expect(screen.getByText("24")).toBeTruthy();
    expect(screen.getByText("5 bill")).toBeTruthy(); // 30-min pace
  });

  it("shows empty state (no spinner) when there are zero open shifts", async () => {
    // Override fetch: shifts list is empty.
    globalThis.fetch = vi.fn(async (): Promise<Response> => {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    render(<ShiftMonitorPage />, { wrapper: makeWrapper() });

    // Empty state text must appear, NOT a persistent loading spinner.
    await waitFor(() => {
      expect(screen.getByText(/không có ca đang mở/i)).toBeTruthy();
    });
    // No "Đang tải…" loading text should remain after the empty state appears.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("resets selected shift when it disappears from the polled list", async () => {
    // First poll returns shift-1; subsequent polls return empty (shift closed).
    let callCount = 0;
    globalThis.fetch = vi.fn(async (url: string): Promise<Response> => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });

      if (path.startsWith("/sales/shifts/shift-1/summary")) return json(SUMMARY);

      if (path.startsWith("/sales/shifts")) {
        callCount++;
        // First call: shift is open; subsequent calls: it has closed.
        return json(callCount === 1 ? OPEN_SHIFTS : []);
      }

      return json([]);
    }) as typeof globalThis.fetch;

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <AuthProvider apiBaseUrl="">{children}</AuthProvider>
      </QueryClientProvider>
    );

    render(<ShiftMonitorPage />, { wrapper: Wrapper });

    // Initially the summary renders (shift-1 is selected).
    await waitFor(() => expect(screen.getByText(/3\.588\.000/)).toBeTruthy());

    // Simulate the next poll returning an empty list (shift closed).
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["open-shifts"] });
    });

    // After the stale shift is removed, the empty state must render — not a
    // permanent loading spinner (the previous bug: summary query fired on a
    // now-invalid shiftId and the loading state never cleared).
    await waitFor(() => {
      expect(screen.getByText(/không có ca đang mở/i)).toBeTruthy();
    });
    // No loading spinner should remain.
    expect(screen.queryByRole("status")).toBeNull();
  });
});
