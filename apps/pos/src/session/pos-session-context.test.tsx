/**
 * PosSessionContext tests.
 *
 * Proves:
 *   - No open shift → status "no-shift"
 *   - openShift() POSTs and transitions to "ready" + sets shiftId
 *   - Open shift found on mount → status "ready"
 *
 * Mocks globalThis.fetch per test (same pattern as admin auth-routing tests).
 */

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PosAuthProvider } from "../auth/pos-auth-context";
import { PosSessionProvider, usePosSession } from "./pos-session-context";

// ── helpers ────────────────────────────────────────────────────────────────

function seedAuth(branchId = "branch-01") {
  sessionStorage.setItem("ibb_pos_at", "test-at");
  sessionStorage.setItem("ibb_pos_rt", "test-rt");
  localStorage.setItem("ibb_pos_branch", branchId);
}

function makeFetch(handlers: Record<string, { status: number; body: unknown }>) {
  return vi.fn(async (url: string, _init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const entry = Object.entries(handlers).find(([key]) => path.startsWith(key));
    const { status, body } = entry?.[1] ?? { status: 404, body: { error: "not found" } };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;
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

// ── Probe component ────────────────────────────────────────────────────────

function SessionProbe({ onOpenShift }: { onOpenShift?: (fn: (cash: number) => Promise<void>) => void }) {
  const session = usePosSession();
  React.useEffect(() => {
    onOpenShift?.(session.openShift);
  }, [session.openShift, onOpenShift]);
  return (
    <div>
      <span data-testid="status">{session.status}</span>
      <span data-testid="shift-id">{session.shiftId ?? "null"}</span>
    </div>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  // Provide a stable device UUID for tests.
  vi.spyOn(crypto, "randomUUID").mockReturnValue("test-device-uuid-0000-000000000000" as `${string}-${string}-${string}-${string}-${string}`);
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe("PosSessionContext — shift lifecycle", () => {
  it("no open shift → status is 'no-shift'", async () => {
    seedAuth();
    globalThis.fetch = makeFetch({
      "/sales/shifts/open": { status: 200, body: null },
    });

    render(<SessionProbe />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("no-shift");
    });
    expect(screen.getByTestId("shift-id").textContent).toBe("null");
  });

  it("open shift found on mount → status is 'ready' with shiftId set", async () => {
    seedAuth();
    globalThis.fetch = makeFetch({
      "/sales/shifts/open": { status: 200, body: { id: "shift-abc", branchId: "branch-01" } },
    });

    render(<SessionProbe />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("ready");
    });
    expect(screen.getByTestId("shift-id").textContent).toBe("shift-abc");
  });

  it("openShift() POSTs /sales/shifts and transitions to 'ready'", async () => {
    seedAuth();
    globalThis.fetch = makeFetch({
      "/sales/shifts/open": { status: 200, body: null },
      "/sales/shifts": { status: 201, body: { id: "shift-new", branchId: "branch-01" } },
    });

    let openShiftFn: ((cash: number) => Promise<void>) | undefined;
    render(
      <SessionProbe onOpenShift={(fn) => { openShiftFn = fn; }} />,
      { wrapper: Wrapper },
    );

    // Wait for no-shift state.
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("no-shift");
    });

    // Call openShift.
    await act(async () => {
      await openShiftFn!(50000);
    });

    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("shift-id").textContent).toBe("shift-new");
  });

  it("404 from /sales/shifts/open is treated as no-shift (not an error)", async () => {
    seedAuth();
    globalThis.fetch = makeFetch({
      "/sales/shifts/open": { status: 404, body: { message: "Not found" } },
    });

    render(<SessionProbe />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("no-shift");
    });
  });

  it("network failure (5xx) surfaces 'error' status and keeps existing shiftId (HI-5)", async () => {
    seedAuth();
    // First call: shift found → ready.
    // Second call (refresh): 503 transient error → must NOT clear shiftId.
    let callCount = 0;
    globalThis.fetch = vi.fn(async (url: string): Promise<Response> => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      if (path.startsWith("/sales/shifts/open")) {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ id: "shift-xyz", branchId: "branch-01" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        // Second call: 503 transient error
        return new Response(JSON.stringify({ error: "service unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }) as typeof globalThis.fetch;

    let refreshFn: (() => Promise<void>) | undefined;
    function SessionProbeWithRefresh() {
      const session = usePosSession();
      React.useEffect(() => {
        refreshFn = session.refresh;
      }, [session.refresh]);
      return (
        <div>
          <span data-testid="status">{session.status}</span>
          <span data-testid="shift-id">{session.shiftId ?? "null"}</span>
        </div>
      );
    }

    render(<SessionProbeWithRefresh />, { wrapper: Wrapper });

    // First load: shift found.
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("ready");
    });
    expect(screen.getByTestId("shift-id").textContent).toBe("shift-xyz");

    // Trigger a refresh that hits 503.
    await act(async () => {
      await refreshFn!();
    });

    // Must surface "error" and preserve the existing shiftId — not "no-shift".
    expect(screen.getByTestId("status").textContent).toBe("error");
    expect(screen.getByTestId("shift-id").textContent).toBe("shift-xyz");
  });
});
