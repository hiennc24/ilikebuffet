/**
 * pos-api-client — re-exports the shared ApiClient.
 *
 * The implementation lives in packages/shared/src/api-client.ts so Admin
 * and POS share one 401-refresh path. This alias keeps POS internal imports
 * unchanged.
 */
export { ApiClient, ApiError } from "@ilikebuffet/shared";
export type { TokenPair, ApiClientDeps } from "@ilikebuffet/shared";
