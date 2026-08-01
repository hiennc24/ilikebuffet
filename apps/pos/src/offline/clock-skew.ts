/**
 * Clock-skew measurement. The device compares its wall clock to the
 * server's (`/health` returns the server `timestamp`). If the offset exceeds the
 * tolerance, offline bill creation must be blocked and the manager warned — a
 * skewed clock corrupts the createdAt used for pricing and the day/number range.
 * The server independently quarantines skewed bills, so this is the first line,
 * not the only line, of defence.
 */

/** ±2 minutes — matches the server's CLOCK_SKEW_TOLERANCE_MS. */
export const CLOCK_SKEW_TOLERANCE_MS = 2 * 60 * 1000;

export interface ClockSkew {
  /** server − device, in ms. Positive = device clock is behind the server. */
  offsetMs: number;
  /** True when |offsetMs| exceeds tolerance → block offline, warn manager. */
  exceeded: boolean;
}

/** Pure: given the server time (ISO) and the device's `Date.now()`, derive skew. */
export function computeSkew(serverIso: string, deviceNowMs: number): ClockSkew {
  const offsetMs = Date.parse(serverIso) - deviceNowMs;
  return { offsetMs, exceeded: Math.abs(offsetMs) > CLOCK_SKEW_TOLERANCE_MS };
}

/**
 * Fetch the server time from /health and compute the current skew. Returns null
 * if the server is unreachable or the response is malformed (offline → unknown).
 */
export async function measureSkew(
  fetchFn: typeof fetch = fetch,
  baseUrl = "",
): Promise<ClockSkew | null> {
  try {
    const res = await fetchFn(`${baseUrl}/health`);
    if (!res.ok) return null;
    const body = (await res.json()) as { timestamp?: string };
    if (!body.timestamp || Number.isNaN(Date.parse(body.timestamp))) return null;
    return computeSkew(body.timestamp, Date.now());
  } catch {
    return null;
  }
}
