import { describe, it, expect, vi, afterEach } from "vitest";
import { computeSkew, measureSkew, CLOCK_SKEW_TOLERANCE_MS } from "./clock-skew";

describe("computeSkew", () => {
  it("returns offset server − device and flags within tolerance", () => {
    const now = 1_000_000_000_000;
    const s = computeSkew(new Date(now + 30_000).toISOString(), now);
    expect(s.offsetMs).toBe(30_000);
    expect(s.exceeded).toBe(false);
  });

  it("flags exceeded when |offset| > ±2 min (either direction)", () => {
    const now = 1_000_000_000_000;
    expect(computeSkew(new Date(now + CLOCK_SKEW_TOLERANCE_MS + 1_000).toISOString(), now).exceeded).toBe(true);
    expect(computeSkew(new Date(now - CLOCK_SKEW_TOLERANCE_MS - 1_000).toISOString(), now).exceeded).toBe(true);
  });
});

describe("measureSkew", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads /health timestamp and returns a skew", async () => {
    const now = Date.now();
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ timestamp: new Date(now + 5_000).toISOString() }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const s = await measureSkew(fetchFn);
    expect(s).not.toBeNull();
    expect(Math.abs(s!.offsetMs - 5_000)).toBeLessThan(1_000);
  });

  it("returns null when the server is unreachable (offline)", async () => {
    const fetchFn = vi.fn(async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    expect(await measureSkew(fetchFn)).toBeNull();
  });

  it("returns null on a malformed response", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ nope: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ) as unknown as typeof fetch;
    expect(await measureSkew(fetchFn)).toBeNull();
  });
});
