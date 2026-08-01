/**
 * SellPage tests.
 *
 * Proves:
 *   - Ticket type tiles render after fetch
 *   - Tapping a tile adds it to the cart (PaymentPanel shows item)
 *   - Cart persists to Dexie on tap
 *   - Cart hydrates from Dexie on remount
 *
 * Mocks globalThis.fetch for /sales/ticket-types and /sales/pricing/resolve.
 * Uses fake-indexeddb so Dexie works in jsdom.
 */

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PosAuthProvider } from "../auth/pos-auth-context";
import { PosSessionProvider } from "../session/pos-session-context";
import { SellPage } from "./sell-page";
import { posDb } from "../db/pos-db";

// ── helpers ────────────────────────────────────────────────────────────────

const TICKET_TYPES = [
  { id: "tt-1", name: "Buffet người lớn", color: "#235B54", displayOrder: 1, isFree: false, status: "ACTIVE" },
  { id: "tt-2", name: "Trẻ em", color: "#C96442", displayOrder: 2, isFree: false, status: "ACTIVE" },
  { id: "tt-3", name: "Miễn phí", color: "#888", displayOrder: 3, isFree: true, status: "ACTIVE" },
  { id: "tt-4", name: "Không bán", color: "#aaa", displayOrder: 4, isFree: false, status: "INACTIVE" },
];

// Snapshot pricing tt-1 = 185k, tt-2 = 90k across all day types.
const SNAPSHOT = {
  snapshotGeneratedAt: 0,
  timeWindows: [{ id: "tw", name: "Cả ngày", startMinute: 0, endMinute: 1440 }],
  versions: [
    {
      id: "v1",
      effectiveDateStr: "2026-01-01",
      branchId: null,
      cells: (["REGULAR", "WEEKEND", "HOLIDAY"] as const).flatMap((dt) => [
        { ticketTypeId: "tt-1", timeWindowId: "tw", dayType: dt, priceVnd: 185000, branchId: null },
        { ticketTypeId: "tt-2", timeWindowId: "tw", dayType: dt, priceVnd: 90000, branchId: null },
      ]),
    },
  ],
};

function makeFetch() {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    // refreshCatalog fetches these three; the sell screen prices client-side.
    if (path.startsWith("/sales/pricing/versions/snapshot")) return json(200, SNAPSHOT);
    if (path.startsWith("/sales/ticket-types")) return json(200, TICKET_TYPES);
    if (path.startsWith("/branches")) return json(200, { data: [{ id: "branch-01", code: "CN01" }] });
    if (path.startsWith("/sales/shifts/open")) return json(200, { id: "shift-test", branchId: "branch-01" });
    return json(404, { error: "not found" });
  }) as typeof globalThis.fetch;
}

function seedAuth(branchId = "branch-01") {
  sessionStorage.setItem("ibb_pos_at", "test-at");
  sessionStorage.setItem("ibb_pos_rt", "test-rt");
  localStorage.setItem("ibb_pos_branch", branchId);
}

function makeWrapper(_branchId = "branch-01") {
  // Fresh QueryClient per wrapper to avoid cross-test cache bleed.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <PosAuthProvider apiBaseUrl="">
          <PosSessionProvider>{children}</PosSessionProvider>
        </PosAuthProvider>
      </QueryClientProvider>
    );
  };
}

// ── setup / teardown ───────────────────────────────────────────────────────

beforeEach(async () => {
  seedAuth();
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "test-device-uuid-0000-000000000000" as `${string}-${string}-${string}-${string}-${string}`,
  );
  await posDb.open();
  await posDb.draft_bills.clear();
  await posDb.catalog_cache.clear();
  localStorage.clear();
  sessionStorage.clear();
  seedAuth();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await posDb.draft_bills.clear();
  sessionStorage.clear();
  localStorage.clear();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("SellPage — ticket grid", () => {
  it("renders active ticket type tiles after fetch", async () => {
    globalThis.fetch = makeFetch();
    render(<SellPage />, { wrapper: makeWrapper() });

    // Wait for tiles to appear — there are 3 ACTIVE types.
    await waitFor(() => {
      expect(screen.getAllByTestId("sell-grid-tile")).toHaveLength(3);
    });

    // INACTIVE ticket must not appear.
    expect(screen.queryByText("Không bán")).toBeNull();

    // Active tiles are present.
    expect(screen.getByText("Buffet người lớn")).toBeTruthy();
    expect(screen.getByText("Trẻ em")).toBeTruthy();
    expect(screen.getByText("Miễn phí")).toBeTruthy();
  });

  it("free ticket shows 0₫ price", async () => {
    globalThis.fetch = makeFetch();
    render(<SellPage />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getAllByTestId("sell-grid-tile")).toHaveLength(3);
    });

    // The free tile's aria-label should contain "0" in VND formatting.
    const freeTile = screen.getByLabelText(/miễn phí/i);
    expect(freeTile.getAttribute("aria-label")).toContain("0");
  });
});

describe("SellPage — cart interactions", () => {
  it("tapping a tile adds it to the cart (PaymentPanel shows item)", async () => {
    globalThis.fetch = makeFetch();
    render(<SellPage />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getAllByTestId("sell-grid-tile")).toHaveLength(3);
    });

    // Tap "Buffet người lớn".
    const buffetTile = screen.getByLabelText(/buffet người lớn/i);
    await act(async () => {
      fireEvent.click(buffetTile);
    });

    // PaymentPanel shows item (renders the name in the order list).
    await waitFor(() => {
      expect(screen.getAllByText(/buffet người lớn/i).length).toBeGreaterThanOrEqual(2);
    });
  });

  it("tapping the same tile twice increments quantity", async () => {
    globalThis.fetch = makeFetch();
    render(<SellPage />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getAllByTestId("sell-grid-tile")).toHaveLength(3);
    });

    const buffetTile = screen.getByLabelText(/buffet người lớn/i);
    await act(async () => {
      fireEvent.click(buffetTile);
      fireEvent.click(buffetTile);
    });

    // PaymentPanel shows "2×" for the quantity.
    await waitFor(() => {
      expect(screen.getByText("2×")).toBeTruthy();
    });
  });

  it("cart persists to Dexie after tile tap", async () => {
    globalThis.fetch = makeFetch();
    render(<SellPage />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getAllByTestId("sell-grid-tile")).toHaveLength(3);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/buffet người lớn/i));
    });

    // Give the save effect a tick to run.
    await waitFor(async () => {
      const draft = await posDb.draft_bills
        .where("branchId")
        .equals("branch-01")
        .filter((d) => d.tableId === null)
        .first();
      expect(draft).toBeDefined();
      expect(draft!.items).toHaveLength(1);
      expect(draft!.items[0].menuItemId).toBe("tt-1");
    });
  });

  it("hydrates cart from Dexie on remount", async () => {
    // Pre-seed a draft in Dexie.
    await posDb.draft_bills.add({
      tableId: null,
      branchId: "branch-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [
        { menuItemId: "tt-2", name: "Trẻ em", quantity: 3, unitPrice: 90000 },
      ],
    });

    globalThis.fetch = makeFetch();
    render(<SellPage />, { wrapper: makeWrapper() });

    // After mount + hydration the cart should show the seeded item.
    await waitFor(() => {
      expect(screen.getByText("3×")).toBeTruthy();
    });
    expect(screen.getAllByText(/trẻ em/i).length).toBeGreaterThanOrEqual(2);
  });
});
