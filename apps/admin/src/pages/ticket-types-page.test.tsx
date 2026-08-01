/**
 * TicketTypesPage tests — ticket type management screen.
 *
 * Harness: mock globalThis.fetch by path+method, seed sessionStorage/localStorage
 * tokens, wrap in QueryClientProvider + AuthProvider (mirroring auth-routing.test.tsx).
 */

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { TicketTypesPage } from "./ticket-types-page";

// ── jsdom polyfill: <dialog> showModal/close not implemented in jsdom ─────────
//
// jsdom does not implement HTMLDialogElement.showModal() or .close().
// We patch the prototype once per module so Dialog renders without throwing.
// The `open` attribute is toggled manually to track state.

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

// ── Test harness ──────────────────────────────────────────────────────────────

const SAMPLE_TYPES = [
  {
    id: "tt-1",
    name: "Vé người lớn",
    description: "Dành cho người lớn",
    displayOrder: 1,
    color: "#3B82F6",
    isFree: false,
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tt-2",
    name: "Vé trẻ em miễn phí",
    description: null,
    displayOrder: 2,
    color: "#10B981",
    isFree: true,
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tt-3",
    name: "Vé đã ngưng",
    description: "Không còn sử dụng",
    displayOrder: 99,
    color: "#6B7280",
    isFree: false,
    status: "INACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
];

type FetchHandler = {
  status: number;
  body: unknown;
};

type HandlerMap = Record<string, Partial<Record<string, FetchHandler>>>;

/**
 * Mock fetch that dispatches on `${method} ${path}`.
 * Falls back to GET-only handlers when method-specific entry absent.
 */
function mockFetch(handlers: HandlerMap) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method ?? "GET").toUpperCase();

    // Match by path prefix, method-specific first then GET fallback.
    const entry = Object.entries(handlers).find(([key]) => path.startsWith(key));
    if (!entry) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const [, methodMap] = entry;
    const handler = methodMap?.[method] ?? methodMap?.["GET"];
    if (!handler) {
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(handler.body), {
      status: handler.status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderPage(fetchMock: ReturnType<typeof mockFetch>) {
  globalThis.fetch = fetchMock as typeof globalThis.fetch;

  const client = makeQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider apiBaseUrl="">
        <TicketTypesPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

// Seed tokens so AuthProvider considers the session authenticated.
function seedSession() {
  sessionStorage.setItem("ibb_admin_at", "test-at");
  sessionStorage.setItem("ibb_admin_rt", "test-rt");
  localStorage.setItem("ibb_admin_branch", "branch-1");
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  seedSession();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TicketTypesPage", () => {
  it("renders ticket type names from GET /sales/ticket-types", async () => {
    const fetchMock = mockFetch({
      "/sales/ticket-types": {
        GET: { status: 200, body: SAMPLE_TYPES },
      },
    });

    renderPage(fetchMock);

    // Wait for async data to appear.
    expect(await screen.findByText("Vé người lớn")).toBeTruthy();
    expect(screen.getByText("Vé trẻ em miễn phí")).toBeTruthy();
    expect(screen.getByText("Vé đã ngưng")).toBeTruthy();
  });

  it("shows 'Miễn phí' badge for isFree ticket types", async () => {
    const fetchMock = mockFetch({
      "/sales/ticket-types": {
        GET: { status: 200, body: SAMPLE_TYPES },
      },
    });

    renderPage(fetchMock);

    await screen.findByText("Vé trẻ em miễn phí");

    // The isFree row should show the Miễn phí badge.
    expect(screen.getByText("Miễn phí")).toBeTruthy();
  });

  it("clicking 'Thêm loại vé', filling name, submitting calls POST with correct body and refetches", async () => {
    let getCallCount = 0;
    const fetchMock = mockFetch({
      "/sales/ticket-types": {
        GET: {
          status: 200,
          // Return different data on second fetch to verify refetch.
          get body() {
            getCallCount++;
            if (getCallCount === 1) return SAMPLE_TYPES;
            return [
              ...SAMPLE_TYPES,
              {
                id: "tt-new",
                name: "Vé mới tạo",
                description: null,
                displayOrder: 5,
                color: "#3B82F6",
                isFree: false,
                status: "ACTIVE",
                createdAt: "2026-08-01T00:00:00.000Z",
                updatedAt: "2026-08-01T00:00:00.000Z",
              },
            ];
          },
        },
        POST: {
          status: 201,
          body: {
            id: "tt-new",
            name: "Vé mới tạo",
            description: null,
            displayOrder: 5,
            color: "#3B82F6",
            isFree: false,
            status: "ACTIVE",
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
          },
        },
      },
    });

    renderPage(fetchMock);

    // Wait for initial list render.
    await screen.findByText("Vé người lớn");

    // Open create dialog.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /thêm loại vé/i }));
    });

    // Dialog should appear with the name field.
    expect(await screen.findByLabelText(/tên loại vé/i)).toBeTruthy();

    // Fill in the name field.
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/tên loại vé/i), {
        target: { value: "Vé mới tạo" },
      });
    });

    // Submit the form.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /tạo loại vé/i }));
    });

    // POST should have been called with the correct body.
    await waitFor(() => {
      const postCall = (fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit | undefined]>).find(
        ([, init]) => (init?.method ?? "GET").toUpperCase() === "POST",
      );
      expect(postCall).toBeTruthy();
      const sentBody = JSON.parse(postCall![1]!.body as string) as Record<string, unknown>;
      expect(sentBody.name).toBe("Vé mới tạo");
    });

    // After success, list should be refetched showing the new item.
    await waitFor(() => {
      expect(screen.getByText("Vé mới tạo")).toBeTruthy();
    });
  });

  it("surfaces error message when POST returns 403", async () => {
    const fetchMock = mockFetch({
      "/sales/ticket-types": {
        GET: { status: 200, body: SAMPLE_TYPES },
        POST: {
          status: 403,
          body: {
            statusCode: 403,
            message: "Bạn không có quyền thực hiện hành động này",
            error: "Forbidden",
          },
        },
      },
    });

    renderPage(fetchMock);

    await screen.findByText("Vé người lớn");

    // Open create dialog.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /thêm loại vé/i }));
    });

    await screen.findByLabelText(/tên loại vé/i);

    // Fill name and submit.
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/tên loại vé/i), {
        target: { value: "Vé không được phép" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /tạo loại vé/i }));
    });

    // An error message should appear inside the dialog.
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeTruthy();
      // The message should contain the 403 content or a fallback.
      expect(alert.textContent).toBeTruthy();
    });
  });
});
