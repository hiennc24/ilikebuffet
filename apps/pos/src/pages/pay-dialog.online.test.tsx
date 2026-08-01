/**
 * PayDialog online path — proves that:
 *   - tenderedVnd is forwarded to POST /sales/bills/:id/payments for CASH (FEATURE)
 *   - tenderedVnd is omitted for non-CASH methods
 *   - exact-pay (tenderedVnd = total) works unchanged
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
import type { OrderItem } from "@ilikebuffet/ui";

const CART: OrderItem[] = [{ id: "tt-1", name: "Người lớn", quantity: 2, unitPrice: 200000 }];
// Bill total = 400000

/** Captures the last POST body sent to /sales/bills/:id/payments. */
let capturedPaymentBody: unknown = null;

function makeFetch() {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    if (path.startsWith("/sales/shifts/open")) return json(200, { id: "shift-1", branchId: "branch-01" });
    if (path.startsWith("/sales/bills") && path.includes("/payments")) {
      capturedPaymentBody = JSON.parse((init?.body as string) ?? "{}");
      return json(200, {});
    }
    if (path.startsWith("/sales/bills")) {
      return json(201, {
        id: "bill-server-1",
        number: "CN01-260801-0001",
        totalVnd: 400000,
        guestCount: 2,
        status: "OPEN",
        lines: [{ ticketTypeName: "Người lớn", unitPriceVnd: 200000, qty: 2, lineTotalVnd: 400000 }],
      });
    }
    if (path.startsWith("/branches")) return json(200, { data: [{ id: "branch-01", name: "CN", code: "CN01" }] });
    if (path.startsWith("/health")) return json(200, { serverTime: new Date().toISOString() });
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

function Host({ clientUuid }: { clientUuid: string }) {
  const { shiftId } = usePosSession();
  return shiftId ? (
    <PayDialog open onClose={() => {}} cartItems={CART} clientUuid={clientUuid} onPaymentSuccess={() => {}} />
  ) : (
    <div>loading</div>
  );
}

beforeEach(() => {
  capturedPaymentBody = null;
  sessionStorage.setItem("ibb_pos_at", "at");
  sessionStorage.setItem("ibb_pos_rt", "rt");
  localStorage.setItem("ibb_pos_branch", "branch-01");
  localStorage.setItem("ibb_pos_device_id", "dev-A");
  localStorage.setItem("ibb_pos_branch_code", "CN01");
  globalThis.fetch = makeFetch();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
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

describe("PayDialog — online, cash over-tender", () => {
  it("sends tenderedVnd to the server when cash tendered > total", async () => {
    render(<Host clientUuid="online-uuid-1" />, { wrapper: Wrapper });

    // Wait for the bill to be created and payment step reached.
    await waitFor(() => expect(screen.getByLabelText(/tiền khách đưa/i)).toBeTruthy());

    // Customer pays 500,000 for a 400,000 bill.
    const tenderedField = screen.getByLabelText(/tiền khách đưa/i);
    await act(async () => {
      fireEvent.change(tenderedField, { target: { value: "500000" } });
    });

    // Change displayed.
    await waitFor(() => expect(screen.getByText(/tiền thối/i)).toBeTruthy());

    // Confirm payment.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /xác nhận thanh toán/i }));
    });

    await waitFor(() => expect(screen.getByText(/thanh toán thành công/i)).toBeTruthy());

    // Server received tenderedVnd.
    expect(capturedPaymentBody).toEqual({
      payments: [{ method: "CASH", amountVnd: 400000, reference: undefined, tenderedVnd: 500000 }],
    });
  });

  it("sends tenderedVnd equal to total when cashier pays exact (exact-pay flow unchanged)", async () => {
    render(<Host clientUuid="online-uuid-2" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByLabelText(/tiền khách đưa/i)).toBeTruthy());
    // Default tenderedInput = totalVnd, no change needed.

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /xác nhận thanh toán/i }));
    });

    await waitFor(() => expect(screen.getByText(/thanh toán thành công/i)).toBeTruthy());

    // tenderedVnd = 400000 (same as total), still sent.
    expect(capturedPaymentBody).toEqual({
      payments: [{ method: "CASH", amountVnd: 400000, reference: undefined, tenderedVnd: 400000 }],
    });
  });

  it("omits tenderedVnd for CARD payment", async () => {
    render(<Host clientUuid="online-uuid-3" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByLabelText(/tiền khách đưa/i)).toBeTruthy());

    // Switch to CARD — the cash tendered input disappears.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /thẻ/i }));
    });

    // CARD has the "Số tiền nhận" field (non-CASH path).
    await waitFor(() => expect(screen.getByLabelText(/số tiền nhận/i)).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /xác nhận thanh toán/i }));
    });

    await waitFor(() => expect(screen.getByText(/thanh toán thành công/i)).toBeTruthy());

    // tenderedVnd must NOT be present for CARD.
    const payments = (capturedPaymentBody as { payments: Array<{ tenderedVnd?: number }> }).payments;
    expect(payments[0].tenderedVnd).toBeUndefined();
  });
});
