import {
  assertVndInteger,
  roundVnd,
  splitVndEvenly,
  applyPercent,
  formatVnd,
  MoneyError,
} from "./money";

describe("money — VND integer discipline", () => {
  describe("assertVndInteger", () => {
    it("accepts integer VND", () => {
      expect(() => assertVndInteger(150_000)).not.toThrow();
      expect(() => assertVndInteger(0)).not.toThrow();
    });

    it("rejects float VND (silent float drift is the enemy)", () => {
      expect(() => assertVndInteger(150_000.5)).toThrow(MoneyError);
      expect(() => assertVndInteger(0.1 + 0.2)).toThrow(MoneyError);
    });

    it("rejects NaN / Infinity / non-finite", () => {
      expect(() => assertVndInteger(NaN)).toThrow(MoneyError);
      expect(() => assertVndInteger(Infinity)).toThrow(MoneyError);
    });
  });

  describe("roundVnd", () => {
    it("rounds to nearest integer đồng (half-up)", () => {
      expect(roundVnd(150_000.4)).toBe(150_000);
      expect(roundVnd(150_000.5)).toBe(150_001);
      expect(roundVnd(150_000.6)).toBe(150_001);
    });
  });

  describe("splitVndEvenly — bill split must not lose or invent đồng", () => {
    it("distributes remainder so parts sum exactly to total", () => {
      // 100_000 / 3 = 33_333.33... -> classic float drift trap
      const parts = splitVndEvenly(100_000, 3);
      expect(parts).toHaveLength(3);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(100_000);
      // remainder (1đ) goes to earliest parts, all integer
      expect(parts).toEqual([33_334, 33_333, 33_333]);
      parts.forEach((p) => expect(Number.isInteger(p)).toBe(true));
    });

    it("handles exact division", () => {
      expect(splitVndEvenly(90_000, 3)).toEqual([30_000, 30_000, 30_000]);
    });

    it("rejects non-integer total", () => {
      expect(() => splitVndEvenly(100.5, 2)).toThrow(MoneyError);
    });

    it("rejects zero or negative parts count", () => {
      expect(() => splitVndEvenly(100, 0)).toThrow(MoneyError);
    });
  });

  describe("applyPercent — percentage on money stays integer", () => {
    it("applies a percentage and rounds to integer đồng", () => {
      // 10% VAT on 150_000 = 15_000
      expect(applyPercent(150_000, 10)).toBe(15_000);
      // 8.5% of 12_345 = 1049.325 -> 1049
      expect(applyPercent(12_345, 8.5)).toBe(1_049);
    });

    it("result is always a safe integer", () => {
      const r = applyPercent(999_999, 33.33);
      expect(Number.isInteger(r)).toBe(true);
    });

    it("rejects when the intermediate product overflows safe-integer range", () => {
      // amount * percent (~1e17) exceeds MAX_SAFE_INTEGER (~9e15) -> precision lost.
      expect(() => applyPercent(999_999_999_999, 100_000)).toThrow(MoneyError);
    });
  });

  describe("negative amounts — pin refund/adjustment behaviour", () => {
    it("splitVndEvenly on a negative total sums exactly to the total", () => {
      const parts = splitVndEvenly(-100_000, 3);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(-100_000);
      parts.forEach((p) => expect(Number.isInteger(p)).toBe(true));
    });

    it("roundVnd on negatives rounds toward +∞ at .5 (documented convention)", () => {
      // Math.round semantics: -0.5 -> -0, -1.5 -> -1. Pinned so refunds are predictable.
      expect(roundVnd(-150_000.5)).toBe(-150_000);
      expect(roundVnd(-150_000.6)).toBe(-150_001);
    });
  });

  describe("formatVnd — vi-VN display", () => {
    it("formats with thousands separators and đ suffix", () => {
      expect(formatVnd(150_000)).toBe("150.000 ₫");
      expect(formatVnd(0)).toBe("0 ₫");
      expect(formatVnd(1_234_567)).toBe("1.234.567 ₫");
    });

    it("refuses to format a non-integer amount", () => {
      expect(() => formatVnd(150_000.5)).toThrow(MoneyError);
    });
  });
});
