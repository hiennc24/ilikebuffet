/**
 * Auth flow behavior tests (behavior, not structure).
 *
 * Covers:
 *   1. 401 → refresh → retry original request succeeds
 *   2. refresh fail → onAuthFailure called + ApiError thrown (no loop)
 *   3. Retried request returns 401 → onAuthFailure called before throw
 *   4. Concurrent 401s dedup to exactly ONE /auth/refresh call
 *   5. Token + branch headers attached correctly
 *   6. Non-401 errors surface as ApiError with correct status
 *
 * Uses ApiClient from @ilikebuffet/shared (single source of truth for the HTTP client).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiError } from "@ilikebuffet/shared";
import type { ApiClientDeps } from "@ilikebuffet/shared";

// ── helpers ────────────────────────────────────────────────────────────────

function makeFetch(responses: Array<{ status: number; body?: unknown }>) {
  let call = 0;
  return vi.fn((_url: string, _init?: RequestInit): Promise<Response> => {
    const resp = responses[call] ?? responses[responses.length - 1];
    call++;
    const body = resp.body !== undefined ? JSON.stringify(resp.body) : "";
    return Promise.resolve(
      new Response(body, {
        status: resp.status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
}

function makeClient(
  overrides: Partial<ApiClientDeps> = {},
  onRefreshed = vi.fn(),
  onAuthFailure = vi.fn(),
) {
  return new ApiClient({
    baseUrl: "",
    getTokens: () => ({ accessToken: "at", refreshToken: "rt" }),
    getBranchId: () => null,
    onRefreshed,
    onAuthFailure,
    ...overrides,
  });
}

// ── 401 → refresh → retry ─────────────────────────────────────────────────

describe("ApiClient — 401 → silent refresh → retry", () => {
  let onRefreshed: ReturnType<typeof vi.fn>;
  let onAuthFailure: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onRefreshed = vi.fn();
    onAuthFailure = vi.fn();
  });

  it("retries the original request after a successful refresh", async () => {
    const fetch = makeFetch([
      { status: 401 },
      { status: 200, body: { accessToken: "new-at", refreshToken: "new-rt" } },
      { status: 200, body: { data: "ok" } },
    ]);

    const client = makeClient({}, onRefreshed, onAuthFailure);
    const original = globalThis.fetch;
    globalThis.fetch = fetch as typeof globalThis.fetch;

    try {
      const result = await client.get<{ data: string }>("/api/items");
      expect(result.data).toBe("ok");
      expect(onRefreshed).toHaveBeenCalledWith({ accessToken: "new-at", refreshToken: "new-rt" });
      expect(onAuthFailure).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("calls onAuthFailure and throws when refresh fails (no retry loop)", async () => {
    const fetch = makeFetch([
      { status: 401 }, // original request
      { status: 401 }, // /auth/refresh also fails
    ]);

    const client = makeClient({}, onRefreshed, onAuthFailure);
    const original = globalThis.fetch;
    globalThis.fetch = fetch as typeof globalThis.fetch;

    try {
      await expect(client.get("/api/items")).rejects.toThrow(ApiError);
      expect(onAuthFailure).toHaveBeenCalledOnce();
      // Exactly 2 fetches: original + refresh attempt. No further retries.
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("calls onAuthFailure when RETRIED request returns 401 (dead session)", async () => {
    // Scenario: refresh succeeds (returns new token) but the server has
    // revoked the session server-side, so the retried request also 401s.
    // The client must call onAuthFailure — otherwise the caller is left
    // with a silently broken session that never recovers.
    const fetch = makeFetch([
      { status: 401 },                                            // original
      { status: 200, body: { accessToken: "new-at", refreshToken: "new-rt" } }, // refresh OK
      { status: 401 },                                            // retry still 401
    ]);

    const client = makeClient({}, onRefreshed, onAuthFailure);
    const original = globalThis.fetch;
    globalThis.fetch = fetch as typeof globalThis.fetch;

    try {
      await expect(client.get("/api/items")).rejects.toThrow(ApiError);
      // onAuthFailure MUST be called so the caller can redirect to login.
      expect(onAuthFailure).toHaveBeenCalledOnce();
      // refresh DID succeed (new token was issued)
      expect(onRefreshed).toHaveBeenCalledOnce();
      // 3 fetches: original + refresh + retry
      expect(fetch).toHaveBeenCalledTimes(3);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("concurrent 401s result in exactly ONE /auth/refresh call", async () => {
    // Real concurrency test: the refresh promise is NOT yet resolved when
    // the second request hits 401, so both await the same in-flight promise.
    let refreshCalls = 0;

    // Deferred promise to hold the refresh response until we choose to release it.
    let resolveRefresh!: (r: Response) => void;
    const refreshHeld = new Promise<Response>((res) => { resolveRefresh = res; });

    const customFetch = vi.fn((url: string): Promise<Response> => {
      const urlStr = String(url);

      if (urlStr.includes("/auth/refresh")) {
        refreshCalls++;
        // Hold the refresh response until both original requests have called
        // silentRefresh() — this guarantees real concurrency in dedup check.
        return refreshHeld;
      }

      // All non-refresh requests: return 401 (triggering refresh).
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const client = makeClient({}, onRefreshed, onAuthFailure);
    const original = globalThis.fetch;
    globalThis.fetch = customFetch as typeof globalThis.fetch;

    try {
      // Start both requests concurrently — they hit 401 and both call silentRefresh().
      const p1 = client.get("/api/a").catch(() => null);
      const p2 = client.get("/api/b").catch(() => null);

      // Yield to let both requests reach silentRefresh() and enter the dedup block.
      await Promise.resolve();
      await Promise.resolve();

      // Now release the refresh response — both waiters get the same result.
      resolveRefresh(
        new Response(
          JSON.stringify({ accessToken: "new-at", refreshToken: "new-rt" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await Promise.all([p1, p2]);

      // EXACTLY one refresh call despite two concurrent 401s (strengthened).
      expect(refreshCalls).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ── Token + branch headers ─────────────────────────────────────────────────

describe("ApiClient — request headers", () => {
  it("attaches Authorization and x-branch-id when available", async () => {
    const capturedHeaders: Record<string, string>[] = [];
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit): Promise<Response> => {
      capturedHeaders.push((init?.headers ?? {}) as Record<string, string>);
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = makeClient({
      getTokens: () => ({ accessToken: "tok-abc", refreshToken: "rt" }),
      getBranchId: () => "br-99",
    });

    const original = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof globalThis.fetch;

    try {
      await client.get("/api/test");
      expect(capturedHeaders[0]["Authorization"]).toBe("Bearer tok-abc");
      expect(capturedHeaders[0]["x-branch-id"]).toBe("br-99");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("omits x-branch-id when no branch selected", async () => {
    const capturedHeaders: Record<string, string>[] = [];
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit): Promise<Response> => {
      capturedHeaders.push((init?.headers ?? {}) as Record<string, string>);
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = makeClient({ getBranchId: () => null });

    const original = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof globalThis.fetch;

    try {
      await client.get("/api/test");
      expect(capturedHeaders[0]["x-branch-id"]).toBeUndefined();
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ── Non-401 errors ─────────────────────────────────────────────────────────

describe("ApiClient — error handling", () => {
  it("throws ApiError with correct status for non-ok non-401 responses", async () => {
    const mockFetch = vi.fn(async (): Promise<Response> =>
      new Response("Not found", { status: 404 }),
    );

    const client = makeClient({ getTokens: () => null });
    const original = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof globalThis.fetch;

    try {
      await expect(client.get("/missing")).rejects.toMatchObject({ status: 404 });
    } finally {
      globalThis.fetch = original;
    }
  });
});
