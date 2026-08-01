/**
 * PayDialog offline path (BH-05 / scenario a): when the network is down, the
 * bill is written to the Dexie outbox with a temp number instead of POSTing —
 * never lost — and the sale completes locally. It syncs on reconnect.
 *
 * Also covers:
 *   - ME-10: clockSkew === null shows a non-blocking warning
 *   - Cash over-tender: tenderedVnd stored in outbox + change display
 */

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PosAuthProvider } from "../auth/pos-auth-context";
import { PosSessionProvider, usePosSession } from "../session/pos-session-context";
import { NetworkStatusProvider } from "../offline/network-status-context";
import { PayDialog } from "./pay-dialog";
import { posDb } from "../db/pos-db";
import { getPendingBills } from "../offline/outbox-store";
import type { OrderItem } from "@ilikebuffet/ui";

const CART: OrderItem[] = [{ id: "tt-1", name: "Người lớn", quantity: 2, unitPrice: 200000 }];
// Bill total = 400000

function makeFetch(opts?: { healthStatus?: number }) {
  const healthStatus = opts?.healthStatus ?? 503; // default: unreachable (offline)
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/sales/shifts/open")) return json(200, { id: "shift-1", branchId: "branch-01" });
    if (path.startsWith("/branches")) return json(200, { data: [{ id: "branch-01", name: "CN", code: "CN01" }] });
    if (path.startsWith("/health")) return json(healthStatus, {});
    return json(404, {});
  }) as typeof globalThis.fetch;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <PosAuthProvider apiBaseUrl="">
        <PosSessionProvider>
          <NetworkStatusProvider>{children}</NetworkStatusProvider>
        </PosSessionProvider>
      </PosAuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  await posDb.offline_outbox.clear();
  sessionStorage.setItem("ibb_pos_at", "at");
  sessionStorage.setItem("ibb_pos_rt", "rt");
  localStorage.setItem("ibb_pos_branch", "branch-01");
  localStorage.setItem("ibb_pos_device_id", "dev-A");
  // Branch code cached earlier while online (network-drops-mid-shift case).
  localStorage.setItem("ibb_pos_branch_code", "CN01");
  globalThis.fetch = makeFetch();
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

/** Opens the dialog only once the session has resolved a shiftId, matching how
 *  the real app opens PayDialog (from the sell screen, after the shift gate). */
function Host({ clientUuid = "offline-uuid-1" }: { clientUuid?: string } = {}) {
  const { shiftId } = usePosSession();
  return shiftId ? (
    <PayDialog open onClose={() => {}} cartItems={CART} clientUuid={clientUuid} onPaymentSuccess={() => {}} />
  ) : (
    <div>loading</div>
  );
}

describe("PayDialog — offline", () => {
  it("queues the bill to the outbox with a temp number and completes locally", async () => {
    render(<Host />, { wrapper: Wrapper });

    // We reach the payment step (cash tendered label visible), but nothing is
    // in the outbox yet — an unpaid bill must not sync prematurely.
    await waitFor(() => expect(screen.getByLabelText(/tiền khách đưa/i)).toBeTruthy());
    expect(await getPendingBills("branch-01")).toHaveLength(0);

    // Confirm payment → the completed bill (with its payment) enters the outbox.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /xác nhận thanh toán/i }));
    });
    expect(await screen.findByText(/đã lưu bill offline/i)).toBeTruthy();

    const pending = await getPendingBills("branch-01");
    expect(pending).toHaveLength(1);
    expect(pending[0].clientUuid).toBe("offline-uuid-1");
    expect(pending[0].tempNumber).toMatch(/^CN01-\d{6}-TDEVA\d{3}$/);
    expect(pending[0].lines).toEqual([{ ticketTypeId: "tt-1", qty: 2 }]);
    expect(pending[0].clockOffsetMs).toBeDefined();
    // Default tendered = total (400000), so tenderedVnd is present.
    expect(pending[0].payments).toEqual([{ method: "CASH", amountVnd: 400000, tenderedVnd: 400000 }]);
  });

  it("double-tapping confirm queues the bill exactly once, no error (CR-3)", async () => {
    render(<Host />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByLabelText(/tiền khách đưa/i)).toBeTruthy());

    const btn = screen.getByRole("button", { name: /xác nhận thanh toán/i });
    await act(async () => {
      fireEvent.click(btn);
      fireEvent.click(btn); // rapid second tap
    });

    // Success, not an error — and exactly one bill in the outbox.
    expect(await screen.findByText(/đã lưu bill offline/i)).toBeTruthy();
    expect(screen.queryByText(/không lưu được bill/i)).toBeNull();
    expect(await getPendingBills("branch-01")).toHaveLength(1);
  });

  it("shows a non-blocking clock-not-verified warning when clockSkew is null (ME-10)", async () => {
    // The health endpoint is unreachable (503), so NetworkStatusProvider
    // never receives a measured skew → clockSkew stays null.
    render(<Host clientUuid="offline-uuid-2" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByLabelText(/tiền khách đưa/i)).toBeTruthy());

    // Warning is shown (non-blocking — the cashier is not blocked).
    expect(screen.getByRole("status")).toBeTruthy();
    // Confirm button is still reachable (not an error step).
    expect(screen.getByRole("button", { name: /xác nhận thanh toán/i })).toBeTruthy();
  });

  it("cash over-tender: stores tenderedVnd and shows change (FEATURE)", async () => {
    render(<Host clientUuid="offline-uuid-3" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByLabelText(/tiền khách đưa/i)).toBeTruthy());

    // Customer hands over 500,000 for a 400,000 bill → change = 100,000.
    const tenderedField = screen.getByLabelText(/tiền khách đưa/i);
    await act(async () => {
      fireEvent.change(tenderedField, { target: { value: "500000" } });
    });

    // Change amount shown in the UI (100,000 VND).
    await waitFor(() => {
      expect(screen.getByText(/tiền thối/i)).toBeTruthy();
    });

    // Confirm payment.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /xác nhận thanh toán/i }));
    });
    expect(await screen.findByText(/đã lưu bill offline/i)).toBeTruthy();

    const pending = await getPendingBills("branch-01");
    expect(pending).toHaveLength(1);
    // amountVnd = bill total (400000); tenderedVnd = what customer handed over.
    expect(pending[0].payments).toEqual([{ method: "CASH", amountVnd: 400000, tenderedVnd: 500000 }]);
  });

  it("cash over-tender: confirm disabled when tendered < total", async () => {
    render(<Host clientUuid="offline-uuid-4" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByLabelText(/tiền khách đưa/i)).toBeTruthy());

    const tenderedField = screen.getByLabelText(/tiền khách đưa/i);
    await act(async () => {
      fireEvent.change(tenderedField, { target: { value: "300000" } });
    });

    // Confirm button must be disabled.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /xác nhận thanh toán/i })).toBeDisabled();
    });
    // Shortfall error is shown.
    expect(screen.getByText(/thiếu/i)).toBeTruthy();
  });
});
