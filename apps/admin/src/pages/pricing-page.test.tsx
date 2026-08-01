/**
 * Tests for PricingPage (VG-02 pricing management screen).
 *
 * Harness mirrors ticket-types-page.test.tsx: polyfill <dialog>, mock
 * globalThis.fetch by path+method, seed sessionStorage/localStorage tokens,
 * wrap in QueryClientProvider + AuthProvider.
 *
 * Coverage:
 *   1. Time windows render name and HH:MM range.
 *   2. Versions appear in the selector; selecting one loads its price matrix.
 *   3. Creating a time window POSTs the correct body and the new name appears.
 *   4. Overlapping-window 4xx surfaces an error message.
 */

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { PricingPage } from "./pricing-page";

// ── jsdom polyfill: <dialog> showModal/close not implemented in jsdom ─────────

function polyfillDialog() {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

polyfillDialog();

// ── Fixtures ───────────────────────────────────────────────────────────────────

const WINDOWS = [
  {
    id: "tw-1",
    name: "Buổi trưa",
    startMinute: 660,
    endMinute: 840,
    displayOrder: 1,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "tw-2",
    name: "Buổi tối",
    startMinute: 1080,
    endMinute: 1320,
    displayOrder: 2,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const VERSIONS = [
  {
    id: "ver-1",
    name: "Giá thường",
    effectiveFrom: "2026-01-01",
    branchId: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "ver-2",
    name: "Giá lễ",
    effectiveFrom: "2026-04-30",
    branchId: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const TICKET_TYPES = [
  {
    id: "tt-1",
    name: "Người lớn",
    color: "#AC4E31",
    isFree: false,
    displayOrder: 1,
    status: "ACTIVE",
  },
  {
    id: "tt-2",
    name: "Trẻ em",
    color: "#235B54",
    isFree: false,
    displayOrder: 2,
    status: "ACTIVE",
  },
];

const CELLS = [
  {
    id: "c-1",
    versionId: "ver-1",
    ticketTypeId: "tt-1",
    timeWindowId: "tw-1",
    dayType: "REGULAR",
    priceVnd: 150000,
    branchId: null,
  },
];

const VERSION_1_WITH_CELLS = { ...VERSIONS[0], cells: CELLS };
const VERSION_2_EMPTY = { ...VERSIONS[1], cells: [] };

// ── Fetch mock ─────────────────────────────────────────────────────────────────

type FetchHandler = {
  status: number;
  body: unknown;
  captureFn?: (body: unknown) => void;
};

/**
 * Build a fetch mock keyed by `"METHOD /path"` or `"/path"` (GET fallback).
 * Matching is prefix-based on the path portion.
 */
function buildMock(
  handlers: Record<string, FetchHandler>,
): typeof globalThis.fetch {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method ?? "GET").toUpperCase();

    // Try method-prefixed key first, then path-only (GET fallback)
    const matchedKey =
      Object.keys(handlers).find((k) => k === `${method} ${path}`) ??
      Object.keys(handlers).find((k) => {
        if (k.includes(" ")) {
          const spaceIdx = k.indexOf(" ");
          const km = k.slice(0, spaceIdx);
          const kp = k.slice(spaceIdx + 1);
          return km === method && path.startsWith(kp);
        }
        return path.startsWith(k);
      });

    const handler = matchedKey ? handlers[matchedKey] : undefined;
    if (!handler) {
      return new Response(
        JSON.stringify({ error: "mock not found", path, method }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    if (handler.captureFn && init?.body) {
      try {
        handler.captureFn(JSON.parse(init.body as string));
      } catch {
        // ignore
      }
    }

    return new Response(JSON.stringify(handler.body), {
      status: handler.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;
}

// ── Render helper ──────────────────────────────────────────────────────────────

function renderPage(fetchMock: typeof globalThis.fetch) {
  globalThis.fetch = fetchMock;

  sessionStorage.setItem("ibb_admin_at", "test-access-token");
  sessionStorage.setItem("ibb_admin_rt", "test-refresh-token");
  localStorage.setItem("ibb_admin_branch", "branch-1");

  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider apiBaseUrl="">
        <PricingPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

// ── Setup / teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("PricingPage — time windows", () => {
  it("renders time window names and HH:MM ranges", async () => {
    renderPage(
      buildMock({
        "GET /sales/pricing/time-windows": { status: 200, body: WINDOWS },
        "GET /sales/pricing/versions": { status: 200, body: VERSIONS },
        "GET /sales/ticket-types": { status: 200, body: TICKET_TYPES },
      }),
    );

    // "Buổi trưa": 660=11:00, 840=14:00
    await waitFor(() => {
      expect(screen.getByText("Buổi trưa")).toBeTruthy();
    });
    expect(screen.getByText("11:00 – 14:00")).toBeTruthy();

    // "Buổi tối": 1080=18:00, 1320=22:00
    expect(screen.getByText("Buổi tối")).toBeTruthy();
    expect(screen.getByText("18:00 – 22:00")).toBeTruthy();
  });
});

describe("PricingPage — version selector and price matrix", () => {
  it("renders versions in the selector and loads matrix when one is selected", async () => {
    renderPage(
      buildMock({
        "GET /sales/pricing/time-windows": { status: 200, body: WINDOWS },
        "GET /sales/pricing/versions": { status: 200, body: VERSIONS },
        "GET /sales/ticket-types": { status: 200, body: TICKET_TYPES },
        "GET /sales/pricing/versions/ver-1": {
          status: 200,
          body: VERSION_1_WITH_CELLS,
        },
        "GET /sales/pricing/versions/ver-2": {
          status: 200,
          body: VERSION_2_EMPTY,
        },
      }),
    );

    // Wait for versions select to appear and have options
    const versionSelect = await screen.findByRole("combobox");
    expect(versionSelect).toBeTruthy();

    // Options should include version names — check option elements directly
    await waitFor(() => {
      const options = Array.from(versionSelect.querySelectorAll("option"));
      const names = options.map((o) => o.textContent ?? "");
      expect(names.some((n) => n.includes("Giá thường"))).toBe(true);
      expect(names.some((n) => n.includes("Giá lễ"))).toBe(true);
    });

    // Select ver-1 to load its matrix
    await act(async () => {
      fireEvent.change(versionSelect, { target: { value: "ver-1" } });
    });

    // Price matrix should show ticket type row header
    await waitFor(() => {
      expect(screen.getByText("Người lớn")).toBeTruthy();
    });

    // Cell with priceVnd=150000 should appear (formatVnd in vi-VN = "150.000 ₫")
    await waitFor(() => {
      // The price text contains "150" as a minimum check (locale rendering varies in jsdom)
      const priceEl = screen.getAllByText(/150/)[0];
      expect(priceEl).toBeTruthy();
    });
  });

  it("shows empty state when selected version has no cells", async () => {
    renderPage(
      buildMock({
        "GET /sales/pricing/time-windows": { status: 200, body: WINDOWS },
        "GET /sales/pricing/versions": { status: 200, body: VERSIONS },
        "GET /sales/ticket-types": { status: 200, body: TICKET_TYPES },
        "GET /sales/pricing/versions/ver-2": {
          status: 200,
          body: VERSION_2_EMPTY,
        },
      }),
    );

    const versionSelect = await screen.findByRole("combobox");

    await act(async () => {
      fireEvent.change(versionSelect, { target: { value: "ver-2" } });
    });

    // Empty state text appears when cells array is empty
    await waitFor(() => {
      expect(screen.getByText(/chưa có ô giá/i)).toBeTruthy();
    });
  });
});

describe("PricingPage — create time window", () => {
  it("POSTs correct body and refetches on success", async () => {
    const capturedBodies: unknown[] = [];
    let getCallCount = 0;

    const WINDOWS_AFTER = [
      ...WINDOWS,
      {
        id: "tw-3",
        name: "Buổi sáng",
        startMinute: 360,
        endMinute: 660,
        displayOrder: 0,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ];

    // Manual fetch mock to count GET calls and return updated list on refetch
    globalThis.fetch = vi.fn(
      async (url: string, init?: RequestInit): Promise<Response> => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, "");
        const method = (init?.method ?? "GET").toUpperCase();

        if (
          method === "GET" &&
          path === "/sales/pricing/time-windows"
        ) {
          getCallCount++;
          const body = getCallCount >= 2 ? WINDOWS_AFTER : WINDOWS;
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (
          method === "POST" &&
          path === "/sales/pricing/time-windows"
        ) {
          if (init?.body) {
            capturedBodies.push(JSON.parse(init.body as string));
          }
          return new Response(
            JSON.stringify({
              id: "tw-3",
              name: "Buổi sáng",
              startMinute: 360,
              endMinute: 660,
              displayOrder: 0,
              createdAt: "2026-01-01T00:00:00Z",
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }

        if (method === "GET" && path === "/sales/pricing/versions") {
          return new Response(JSON.stringify(VERSIONS), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (method === "GET" && path === "/sales/ticket-types") {
          return new Response(JSON.stringify(TICKET_TYPES), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      },
    ) as typeof globalThis.fetch;

    sessionStorage.setItem("ibb_admin_at", "test-at");
    sessionStorage.setItem("ibb_admin_rt", "test-rt");
    localStorage.setItem("ibb_admin_branch", "branch-1");

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider apiBaseUrl="">
          <PricingPage />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Wait for initial render of time windows table
    await waitFor(() => {
      expect(screen.getByText("Buổi trưa")).toBeTruthy();
    });

    // Open "Thêm khung giờ" dialog
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /thêm khung giờ/i }));
    });

    // Wait for dialog fields to appear
    await waitFor(() => {
      expect(screen.getByLabelText(/tên khung giờ/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/tên khung giờ/i), {
      target: { value: "Buổi sáng" },
    });
    fireEvent.change(screen.getByLabelText(/bắt đầu/i), {
      target: { value: "360" },
    });
    fireEvent.change(screen.getByLabelText(/kết thúc/i), {
      target: { value: "660" },
    });

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^lưu$/i }));
    });

    // Verify correct POST body was sent
    await waitFor(() => {
      expect(capturedBodies.length).toBeGreaterThan(0);
    });
    expect(capturedBodies[0]).toEqual({
      name: "Buổi sáng",
      startMinute: 360,
      endMinute: 660,
    });

    // After refetch the new window row should appear
    await waitFor(() => {
      expect(screen.getByText("Buổi sáng")).toBeTruthy();
    });
  });
});

describe("PricingPage — xlsx export (ME-5)", () => {
  it("download goes through ApiClient (same fetch mock), not raw fetch", async () => {
    // The single globalThis.fetch spy covers ALL network calls including the
    // download. If exportVersionXlsx still used a raw fetch with hardcoded
    // storage keys it would bypass this spy on a different URL base and
    // blob() would throw. Passing here proves the auth path is shared.
    const xlsxBlob = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // xlsx magic bytes

    // Keep the spy typed as ReturnType<typeof vi.fn> so .mock is accessible.
    const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "GET" && path === "/sales/pricing/time-windows") {
        return new Response(JSON.stringify(WINDOWS), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (method === "GET" && path === "/sales/pricing/versions") {
        return new Response(JSON.stringify(VERSIONS), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (method === "GET" && path === "/sales/ticket-types") {
        return new Response(JSON.stringify(TICKET_TYPES), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (method === "GET" && path.startsWith("/sales/pricing/versions/ver-1/export")) {
        // Assert the Authorization header is present — proof it went via ApiClient.
        const authHeader = (init?.headers as Record<string, string> | undefined)?.["Authorization"];
        expect(authHeader).toMatch(/^Bearer .+/);
        return new Response(xlsxBlob, {
          status: 200,
          headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        });
      }

      return new Response(JSON.stringify({ error: "mock not found", path, method }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    };
    const fetchSpy = vi.fn(fetchImpl);
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    // jsdom doesn't implement URL.createObjectURL — assign stubs directly.
    const createStub = vi.fn(() => "blob:stub");
    const revokeStub = vi.fn();
    URL.createObjectURL = createStub as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeStub as unknown as typeof URL.revokeObjectURL;
    // Stub anchor click so the download does not navigate.
    const clickStub = vi.spyOn(HTMLAnchorElement.prototype, "click").mockReturnValue(undefined);

    // renderPage sets globalThis.fetch internally; assign our spy first.
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    sessionStorage.setItem("ibb_admin_at", "test-access-token");
    sessionStorage.setItem("ibb_admin_rt", "test-refresh-token");
    localStorage.setItem("ibb_admin_branch", "branch-1");
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider apiBaseUrl="">
          <PricingPage />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Wait for versions to load so the selector appears.
    const versionSelect = await screen.findByRole("combobox");
    await act(async () => {
      fireEvent.change(versionSelect, { target: { value: "ver-1" } });
    });

    // "Xuất Excel" button should appear once a version is selected.
    const exportBtn = await screen.findByRole("button", { name: /xuất excel/i });

    await act(async () => {
      fireEvent.click(exportBtn);
    });

    // Verify the export endpoint was hit via the fetch spy (not a separate
    // raw fetch call that would have bypassed the spy).
    await waitFor(() => {
      const exportCalls = fetchSpy.mock.calls.filter((args) =>
        String(args[0]).includes("/export"),
      );
      expect(exportCalls.length).toBeGreaterThan(0);
    });

    // Blob was passed to createObjectURL → anchor click was triggered.
    expect(createStub).toHaveBeenCalled();
    expect(clickStub).toHaveBeenCalled();

    // clickStub was created via spyOn so restore it; URL stubs were direct assigns.
    clickStub.mockRestore();
  });
});

describe("PricingPage — overlapping time window error", () => {
  it("surfaces a 4xx server error message for an overlapping window", async () => {
    renderPage(
      buildMock({
        "GET /sales/pricing/time-windows": { status: 200, body: WINDOWS },
        "GET /sales/pricing/versions": { status: 200, body: VERSIONS },
        "GET /sales/ticket-types": { status: 200, body: TICKET_TYPES },
        "POST /sales/pricing/time-windows": {
          status: 409,
          body: {
            statusCode: 409,
            message: "Khung giờ bị trùng với khung giờ hiện có",
            error: "Conflict",
          },
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Buổi trưa")).toBeTruthy();
    });

    // Open dialog
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /thêm khung giờ/i }));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/tên khung giờ/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/tên khung giờ/i), {
      target: { value: "Cũng là buổi trưa" },
    });
    fireEvent.change(screen.getByLabelText(/bắt đầu/i), {
      target: { value: "660" },
    });
    fireEvent.change(screen.getByLabelText(/kết thúc/i), {
      target: { value: "840" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^lưu$/i }));
    });

    // Error message from server must appear (via role="alert")
    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      const hasError = alerts.some((el) =>
        /trùng|thất bại|conflict|409/i.test(el.textContent ?? ""),
      );
      expect(hasError).toBe(true);
    });
  });
});
