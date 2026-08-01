/**
 * usePagedList tests — query building + envelope/array normalisation.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { buildListQuery, usePagedList } from "./use-paged-list";

describe("buildListQuery", () => {
  it("always includes page + pageSize", () => {
    expect(buildListQuery(2, 20)).toBe("page=2&pageSize=20");
  });

  it("omits null/undefined/empty filters, keeps the rest", () => {
    const q = buildListQuery(1, 10, {
      status: "COMPLETED",
      q: "",
      branchId: null,
      page2: undefined,
      quarantined: false,
    });
    const params = new URLSearchParams(q);
    expect(params.get("status")).toBe("COMPLETED");
    expect(params.get("quarantined")).toBe("false");
    expect(params.has("q")).toBe(false);
    expect(params.has("branchId")).toBe(false);
    expect(params.has("page2")).toBe(false);
  });
});

function seedAuth() {
  sessionStorage.setItem("ibb_admin_at", "at");
  sessionStorage.setItem("ibb_admin_rt", "rt");
  localStorage.setItem("ibb_admin_branch", "branch-1");
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider apiBaseUrl="">{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("usePagedList", () => {
  beforeEach(() => {
    seedAuth();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("normalises a { data, total } envelope and computes pageCount", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ id: "a" }, { id: "b" }], total: 42 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => usePagedList<{ id: string }>({ queryKey: ["orders"], path: "/sales/bills", page: 1, pageSize: 20 }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.total).toBe(42);
    expect(result.current.pageCount).toBe(3); // ceil(42/20)
  });

  it("falls back to row count for a bare array response", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify([{ id: "x" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => usePagedList<{ id: string }>({ queryKey: ["k"], path: "/sales/bills", page: 1, pageSize: 10 }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.total).toBe(1);
    expect(result.current.pageCount).toBe(1);
  });

  it("does not fetch when disabled", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    renderHook(() => usePagedList({ queryKey: ["k"], path: "/x", page: 1, pageSize: 10, enabled: false }), {
      wrapper: Wrapper,
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
