/**
 * PayDialog offline path (BH-05 / scenario a): when the network is down, the
 * bill is written to the Dexie outbox with a temp number instead of POSTing —
 * never lost — and the sale completes locally. It syncs on reconnect.
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

function makeFetch() {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/sales/shifts/open")) return json(200, { id: "shift-1", branchId: "branch-01" });
    if (path.startsWith("/branches")) return json(200, { data: [{ id: "branch-01", name: "CN", code: "CN01" }] });
    if (path.startsWith("/health")) return json(503, {}); // offline: server unreachable
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
function Host() {
  const { shiftId } = usePosSession();
  return shiftId ? (
    <PayDialog open onClose={() => {}} cartItems={CART} clientUuid="offline-uuid-1" onPaymentSuccess={() => {}} />
  ) : (
    <div>loading</div>
  );
}

describe("PayDialog — offline", () => {
  it("queues the bill to the outbox with a temp number and completes locally", async () => {
    render(<Host />, { wrapper: Wrapper });

    // We reach the payment step, but nothing is in the outbox yet — an unpaid
    // bill must not sync (it would get an official number prematurely).
    await waitFor(() => expect(screen.getByLabelText(/số tiền nhận/i)).toBeTruthy());
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
    expect(pending[0].payments).toEqual([{ method: "CASH", amountVnd: 400000 }]);
  });
});
