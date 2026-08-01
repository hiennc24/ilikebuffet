/// <reference lib="dom" />
/**
 * ApiClient — shared fetch wrapper for ilikebuffet apps.
 *
 * Lifted from apps/admin into packages/shared so Admin and POS
 * share the same 401-refresh path. Divergence on the security-critical
 * refresh path was the risk: one copy means one place to audit/fix.
 *
 * Design:
 *   - Fully deps-injected: storage, redirect, and token callbacks are
 *     passed in by each app's auth context. Zero side-effects here.
 *   - 401 → one silent refresh attempt → retry original request.
 *   - If refresh fails → deps.onAuthFailure() then throw ApiError(401).
 *   - If RETRY returns 401 → deps.onAuthFailure() then throw (
 *     prevents a dead session where the client silently stops working).
 *   - Concurrent refresh deduplicated: only one /auth/refresh in flight.
 *
 * Token storage: intentionally NOT here — each app keeps tokens in
 * sessionStorage/localStorage per its own security trade-offs.
 *
 * ACCEPTED RISK: access tokens live in sessionStorage (XSS-exfiltrable)
 * and the POS deviceSecret lives in localStorage (plaintext). This is an
 * accepted risk. Follow-up: migrate refresh token to httpOnly cookie
 * and implement secure device-secret binding.
 */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface ApiClientDeps {
  /** Return current token pair or null if unauthenticated. */
  getTokens: () => TokenPair | null;
  /** Called after a successful silent refresh with the new token pair. */
  onRefreshed: (tokens: TokenPair) => void;
  /**
   * Called when auth is unrecoverable (refresh failed, or retried request
   * returned 401). The caller should clear session and navigate to login.
   */
  onAuthFailure: () => void;
  /** Currently selected branchId (sent as x-branch-id header). */
  getBranchId: () => string | null;
  /** API base URL. Default: "" (same origin). */
  baseUrl?: string;
}

export class ApiClient {
  private readonly baseUrl: string;
  private deps: ApiClientDeps;
  /** Deduplicates concurrent /auth/refresh calls. */
  private refreshPromise: Promise<TokenPair | null> | null = null;

  constructor(deps: ApiClientDeps) {
    this.deps = deps;
    this.baseUrl = deps.baseUrl ?? "";
  }

  /**
   * Update deps without rebuilding the client instance.
   * Call this whenever auth context re-renders so closures stay current.
   */
  updateDeps(deps: ApiClientDeps): void {
    this.deps = deps;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchRaw(path, init);
    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }
    return response.json() as Promise<T>;
  }

  /**
   * Like `request` but returns the raw Response instead of parsing JSON.
   * Use this when the caller needs to read the body as a Blob, stream, or
   * text — for example, xlsx file downloads. The same 401-silent-refresh
   * and x-branch-id auth flow applies.
   *
   * Throws ApiError on non-2xx (the caller must call `.blob()` / `.text()`
   * on the returned Response when it is ok).
   */
  async fetchRaw(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.doRequest(path, init);

    if (response.status === 401) {
      // Attempt one silent refresh.
      const refreshed = await this.silentRefresh();
      if (!refreshed) {
        // Refresh failed — session is unrecoverable.
        this.deps.onAuthFailure();
        throw new ApiError(401, "Session expired");
      }

      // Retry with the new token.
      const retried = await this.doRequest(path, init);
      // If the retried request also returns 401, the session is
      // dead (e.g. server-side revocation). Call onAuthFailure so the
      // caller is not left with a silently broken session.
      if (retried.status === 401) {
        this.deps.onAuthFailure();
        throw new ApiError(401, await retried.text());
      }
      return retried;
    }

    return response;
  }

  get<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...init, method: "GET" });
  }

  post<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: "POST",
      headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
      body: JSON.stringify(body),
    });
  }

  private buildHeaders(extra?: HeadersInit): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(extra as Record<string, string> | undefined),
    };
    const tokens = this.deps.getTokens();
    if (tokens) headers["Authorization"] = `Bearer ${tokens.accessToken}`;
    const branchId = this.deps.getBranchId();
    if (branchId) headers["x-branch-id"] = branchId;
    return headers;
  }

  private doRequest(path: string, init: RequestInit): Promise<Response> {
    const headers = this.buildHeaders(init.headers as HeadersInit | undefined);
    // For multipart uploads the browser must set Content-Type (with the boundary);
    // a forced application/json would corrupt the request.
    if (init.body instanceof FormData) delete headers["Content-Type"];
    return fetch(`${this.baseUrl}${path}`, { ...init, headers });
  }

  private async silentRefresh(): Promise<TokenPair | null> {
    // Deduplicate: if a refresh is already in flight, both callers await the
    // same promise. Only ONE /auth/refresh request is ever sent.
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const tokens = this.deps.getTokens();
      if (!tokens) return null;
      try {
        const res = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as TokenPair;
        this.deps.onRefreshed(data);
        return data;
      } catch {
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
