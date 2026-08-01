/**
 * ShiftBillsPanel tests — lists shift bills and cancels one with a manager PIN.
 *
 * Mocks globalThis.fetch for /sales/shifts/open (session), /sales/bills (list),
 * and /sales/bills/:id/cancel. Uses fake-indexeddb for the session's Dexie use.
 */

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PosAuthProvider } from "../auth/pos-auth-context";
import { PosSessionProvider } from "../session/pos-session-context";
import { ShiftBillsPanel } from "./shift-bills-panel";

const BILLS = [
  { id: "b1", number: "CN01-260801-0001", totalVnd: 598000, status: "COMPLETED", createdAt: "2026-08-01T13:05:00+07:00" },
  { id: "b2", number: "CN01-260801-0002", totalVnd: 90000, status: "CANCELLED", createdAt: "2026-08-01T13:10:00+07:00" },
];

function makeFetch(cancelStatus = 200, onCancel?: (body: Record<string, unknown>) => void) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    if (path.startsWith("/sales/shifts/open")) return json(200, { id: "shift-test", branchId: "branch-01" });
    if (path.startsWith("/sales/bills/") && path.endsWith("/cancel")) {
      onCancel?.(JSON.parse((init?.body as string) ?? "{}"));
      if (cancelStatus === 200) return json(200, { id: "b1", status: "CANCELLED" });
      return json(cancelStatus, { statusCode: cancelStatus, message: "PIN quản lý không hợp lệ" });
    }
    if (path.startsWith("/sales/bills")) return json(200, BILLS);
    return json(404, { error: "not found" });
  }) as typeof globalThis.fetch;
}

function seedAuth() {
  sessionStorage.setItem("ibb_pos_at", "test-at");
  sessionStorage.setItem("ibb_pos_rt", "test-rt");
  localStorage.setItem("ibb_pos_branch", "branch-01");
  localStorage.setItem("ibb_pos_device_id", "device-1");
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <PosAuthProvider apiBaseUrl="">
        <PosSessionProvider>{children}</PosSessionProvider>
      </PosAuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  seedAuth();
  // jsdom lacks <dialog>.showModal
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe("ShiftBillsPanel", () => {
  it("lists shift bills; completed bills have a Hủy action, cancelled ones don't", async () => {
    globalThis.fetch = makeFetch();
    render(<ShiftBillsPanel open onClose={() => {}} />, { wrapper: Wrapper });

    expect(await screen.findByText("CN01-260801-0001")).toBeTruthy();
    expect(screen.getByText("CN01-260801-0002")).toBeTruthy();
    // Exactly one "Hủy" button (only the COMPLETED bill).
    expect(screen.getAllByRole("button", { name: /^hủy$/i })).toHaveLength(1);
  });

  it("cancels a bill with a manager PIN → POSTs reason/managerId/pin/deviceId", async () => {
    let cancelBody: Record<string, unknown> | null = null;
    globalThis.fetch = makeFetch(200, (b) => (cancelBody = b));
    render(<ShiftBillsPanel open onClose={() => {}} />, { wrapper: Wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /^hủy$/i }));
    fireEvent.change(screen.getByLabelText(/lý do hủy/i), { target: { value: "Khách đổi ý" } });
    fireEvent.change(screen.getByLabelText(/mã quản lý/i), { target: { value: "mgr-1" } });
    fireEvent.change(screen.getByLabelText(/pin quản lý/i), { target: { value: "246810" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /xác nhận hủy/i }));
    });

    await waitFor(() => expect(cancelBody).not.toBeNull());
    expect(cancelBody).toEqual({ reason: "Khách đổi ý", managerId: "mgr-1", pin: "246810", deviceId: "device-1" });
  });

  it("surfaces a 403 (wrong PIN / IDOR) as an error message", async () => {
    globalThis.fetch = makeFetch(403);
    render(<ShiftBillsPanel open onClose={() => {}} />, { wrapper: Wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /^hủy$/i }));
    fireEvent.change(screen.getByLabelText(/lý do hủy/i), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText(/mã quản lý/i), { target: { value: "mgr-1" } });
    fireEvent.change(screen.getByLabelText(/pin quản lý/i), { target: { value: "000000" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /xác nhận hủy/i }));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/PIN quản lý sai|từ chối/i);
  });
});
