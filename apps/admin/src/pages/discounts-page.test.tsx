/**
 * DiscountsPage tests — discount management screen.
 *
 * Covers:
 *   1. Programs render with correct value formatting per kind.
 *   2. Reasons render with name + active badge.
 *   3. Creating a PERCENT program POSTs body with pct (not amountVnd/voucherCode); list refetched.
 *   4. Switching kind to VOUCHER shows voucherCode field and POSTs voucherCode.
 *
 * Harness pattern mirrors auth-routing.test.tsx: mock globalThis.fetch by
 * path+method, seed sessionStorage/localStorage, wrap in QueryClientProvider
 * (retry:false) + AuthProvider apiBaseUrl="".
 */

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/auth-context";
import { DiscountsPage } from "./discounts-page";

// ── Test data ─────────────────────────────────────────────────────────────────

const PERCENT_PROGRAM = {
  id: "prog-1",
  name: "Giảm 15% cuối tuần",
  kind: "PERCENT",
  pct: 15,
  amountVnd: null,
  voucherCode: null,
  quotaTotal: 100,
  quotaRemaining: 80,
  validFrom: "2024-01-01",
  validUntil: "2024-12-31",
  branchScope: null,
  status: "ACTIVE",
  createdAt: "2024-01-01T00:00:00Z",
};

const FIXED_PROGRAM = {
  id: "prog-2",
  name: "Giảm 50.000đ",
  kind: "FIXED_AMOUNT",
  pct: null,
  amountVnd: 50000,
  voucherCode: null,
  quotaTotal: null,
  quotaRemaining: null,
  validFrom: null,
  validUntil: null,
  branchScope: null,
  status: "ACTIVE",
  createdAt: "2024-01-01T00:00:00Z",
};

const VOUCHER_PROGRAM = {
  id: "prog-3",
  name: "Voucher khai trương",
  kind: "VOUCHER",
  pct: null,
  amountVnd: null,
  voucherCode: "GRAND2024",
  quotaTotal: null,
  quotaRemaining: null,
  validFrom: null,
  validUntil: null,
  branchScope: null,
  status: "ACTIVE",
  createdAt: "2024-01-01T00:00:00Z",
};

const REASON_ACTIVE = {
  id: "reason-1",
  name: "Khách VIP",
  isActive: true,
  createdAt: "2024-01-01T00:00:00Z",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function makeFetch(handler: FetchHandler) {
  return vi.fn((url: string, init?: RequestInit): Promise<Response> => {
    return Promise.resolve(handler(url, init));
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function seedAuth() {
  sessionStorage.setItem("ibb_admin_at", "test-at");
  sessionStorage.setItem("ibb_admin_rt", "test-rt");
  localStorage.setItem("ibb_admin_branch", "branch-1");
}

function renderPage(fetchImpl: typeof globalThis.fetch) {
  globalThis.fetch = fetchImpl;

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AuthProvider apiBaseUrl="">
          <DiscountsPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  seedAuth();

  // jsdom does not implement the native <dialog> showModal/close methods.
  // Patch them so Dialog renders open without throwing.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DiscountsPage — programs render with correct value formatting", () => {
  it("shows % for PERCENT, VND for FIXED_AMOUNT, code for VOUCHER", async () => {
    const fetch = makeFetch((url) => {
      if (url.includes("/sales/discounts/programs")) {
        return jsonResponse([PERCENT_PROGRAM, FIXED_PROGRAM, VOUCHER_PROGRAM]);
      }
      if (url.includes("/sales/discounts/reasons")) {
        return jsonResponse([]);
      }
      return jsonResponse({ error: "not found" }, 404);
    });

    renderPage(fetch as typeof globalThis.fetch);

    // PERCENT: shows pct%
    expect(await screen.findByText("15%")).toBeTruthy();

    // FIXED_AMOUNT: shows VND formatted amount (vi-VN uses dots as thousands separator)
    // 50000 formats as "50.000 ₫". The name "Giảm 50.000đ" also matches, so use getAllBy.
    const vndMatches = screen.getAllByText(/50\.000/);
    expect(vndMatches.length).toBeGreaterThanOrEqual(1);
    // Confirm the value cell specifically contains the ₫ symbol
    expect(vndMatches.some((el) => el.textContent?.includes("₫"))).toBe(true);

    // VOUCHER: shows voucher code
    expect(screen.getByText("GRAND2024")).toBeTruthy();
  });

  it("shows kind badges for each program", async () => {
    const fetch = makeFetch((url) => {
      if (url.includes("/sales/discounts/programs")) {
        return jsonResponse([PERCENT_PROGRAM, FIXED_PROGRAM, VOUCHER_PROGRAM]);
      }
      if (url.includes("/sales/discounts/reasons")) {
        return jsonResponse([]);
      }
      return jsonResponse({ error: "not found" }, 404);
    });

    renderPage(fetch as typeof globalThis.fetch);

    expect(await screen.findByText("Phần trăm")).toBeTruthy();
    expect(screen.getByText("Số tiền")).toBeTruthy();
    expect(screen.getByText("Voucher")).toBeTruthy();
  });
});

describe("DiscountsPage — reasons render", () => {
  it("renders reason names and active badge", async () => {
    const fetch = makeFetch((url) => {
      if (url.includes("/sales/discounts/programs")) {
        return jsonResponse([]);
      }
      if (url.includes("/sales/discounts/reasons")) {
        return jsonResponse([REASON_ACTIVE]);
      }
      return jsonResponse({ error: "not found" }, 404);
    });

    renderPage(fetch as typeof globalThis.fetch);

    expect(await screen.findByText("Khách VIP")).toBeTruthy();
    // Active badge appears
    expect(screen.getByText("Đang dùng")).toBeTruthy();
  });
});

describe("DiscountsPage — create PERCENT program", () => {
  it("POSTs body with pct and NOT amountVnd/voucherCode; list refetched", async () => {
    const capturedBodies: unknown[] = [];
    let callCount = 0;

    const fetch = makeFetch((url, init) => {
      const method = init?.method ?? "GET";

      if (url.includes("/sales/discounts/programs") && method === "GET") {
        callCount++;
        // Return empty first, then one program after refetch
        return jsonResponse(callCount > 1 ? [PERCENT_PROGRAM] : []);
      }
      if (url.includes("/sales/discounts/programs") && method === "POST") {
        if (init?.body) {
          capturedBodies.push(JSON.parse(init.body as string));
        }
        return jsonResponse(PERCENT_PROGRAM, 201);
      }
      if (url.includes("/sales/discounts/reasons")) {
        return jsonResponse([]);
      }
      return jsonResponse({ error: "not found" }, 404);
    });

    renderPage(fetch as typeof globalThis.fetch);

    // Wait for page to load
    await screen.findByText("Thêm chương trình");

    // Open create dialog
    await act(async () => {
      fireEvent.click(screen.getByText("Thêm chương trình"));
    });

    // Dialog should be open — kind defaults to PERCENT
    await waitFor(() => {
      expect(screen.getByText("Thêm chương trình giảm giá")).toBeTruthy();
    });

    // Fill name
    const nameInput = screen.getByPlaceholderText("VD: Giảm 10% cuối tuần");
    fireEvent.change(nameInput, { target: { value: "Giảm 15% test" } });

    // Fill pct — label contains "Phần trăm giảm"
    const pctInput = screen.getByPlaceholderText("10");
    fireEvent.change(pctInput, { target: { value: "15" } });

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByText("Tạo chương trình"));
    });

    // POST should have been called with pct
    await waitFor(() => {
      expect(capturedBodies.length).toBeGreaterThan(0);
    });

    const body = capturedBodies[0] as Record<string, unknown>;
    expect(body.pct).toBe(15);
    expect(body.kind).toBe("PERCENT");
    // Must NOT include amountVnd or voucherCode
    expect(body).not.toHaveProperty("amountVnd");
    expect(body).not.toHaveProperty("voucherCode");

    // List should be refetched (GET called more than once)
    await waitFor(() => {
      expect(callCount).toBeGreaterThan(1);
    });
  });
});

describe("DiscountsPage — create VOUCHER program", () => {
  it("switching to VOUCHER shows voucherCode field and POSTs voucherCode", async () => {
    const capturedBodies: unknown[] = [];

    const fetch = makeFetch((url, init) => {
      const method = init?.method ?? "GET";

      if (url.includes("/sales/discounts/programs") && method === "GET") {
        return jsonResponse([]);
      }
      if (url.includes("/sales/discounts/programs") && method === "POST") {
        if (init?.body) {
          capturedBodies.push(JSON.parse(init.body as string));
        }
        return jsonResponse(VOUCHER_PROGRAM, 201);
      }
      if (url.includes("/sales/discounts/reasons")) {
        return jsonResponse([]);
      }
      return jsonResponse({ error: "not found" }, 404);
    });

    renderPage(fetch as typeof globalThis.fetch);

    await screen.findByText("Thêm chương trình");

    // Open create dialog
    await act(async () => {
      fireEvent.click(screen.getByText("Thêm chương trình"));
    });

    await waitFor(() => {
      expect(screen.getByText("Thêm chương trình giảm giá")).toBeTruthy();
    });

    // Switch kind to VOUCHER — use label query to disambiguate from pagination's page-size select
    const kindSelect = screen.getByLabelText(/Loại giảm giá/);
    await act(async () => {
      fireEvent.change(kindSelect, { target: { value: "VOUCHER" } });
    });

    // pct field should disappear, voucherCode field should appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText("VD: WELCOME2024")).toBeTruthy();
    });
    expect(screen.queryByPlaceholderText("10")).toBeNull();

    // Fill name and voucherCode
    fireEvent.change(screen.getByPlaceholderText("VD: Giảm 10% cuối tuần"), {
      target: { value: "Voucher khai trương" },
    });
    fireEvent.change(screen.getByPlaceholderText("VD: WELCOME2024"), {
      target: { value: "GRAND2024" },
    });

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByText("Tạo chương trình"));
    });

    await waitFor(() => {
      expect(capturedBodies.length).toBeGreaterThan(0);
    });

    const body = capturedBodies[0] as Record<string, unknown>;
    expect(body.kind).toBe("VOUCHER");
    expect(body.voucherCode).toBe("GRAND2024");
    expect(body).not.toHaveProperty("pct");
    expect(body).not.toHaveProperty("amountVnd");
  });
});
