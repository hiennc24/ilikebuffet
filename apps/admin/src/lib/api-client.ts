/**
 * api-client — re-exports the shared ApiClient (H2 fix).
 *
 * The implementation now lives in packages/shared/src/api-client.ts so
 * Admin and POS share the same 401-refresh path without duplication.
 * This file is kept as the local import alias so existing imports within
 * apps/admin don't need to change.
 */
export { ApiClient, ApiError } from "@ilikebuffet/shared";
export type { TokenPair, ApiClientDeps } from "@ilikebuffet/shared";
