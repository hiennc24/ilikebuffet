/**
 * api-client — admin-local ApiClient extending the shared base.
 *
 * The base implementation lives in packages/shared/src/api-client.ts so
 * Admin and POS share the same 401-refresh path. This file is kept as the
 * local import alias so existing imports within apps/admin don't need to
 * change, and adds `download(path)` for blob downloads (e.g. xlsx exports).
 *
 * `download` uses the same Authorization + x-branch-id headers and
 * 401-silent-refresh flow as every other request — no raw fetch, no
 * hardcoded storage keys.
 */
import { ApiClient as BaseApiClient, ApiError } from "@ilikebuffet/shared";
export { ApiError } from "@ilikebuffet/shared";
export type { TokenPair, ApiClientDeps } from "@ilikebuffet/shared";

/** Admin-specific ApiClient: base + blob download via the auth path. */
export class ApiClient extends BaseApiClient {
  /**
   * Fetch a binary resource (e.g. xlsx export) as a Blob.
   * Reuses the same auth-header + 401-refresh as `request()`.
   * Throws ApiError on non-2xx.
   */
  async download(path: string): Promise<Blob> {
    // fetchRaw is defined on the shared base: handles 401-refresh + retry,
    // then returns the raw Response (non-2xx other than 401 are returned
    // as-is so we can inspect the status here).
    const response = await this.fetchRaw(path, { method: "GET" });
    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }
    return response.blob();
  }
}
