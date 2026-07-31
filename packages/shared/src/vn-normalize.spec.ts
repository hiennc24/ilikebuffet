/**
 * TDD: Step 1 RED — Vietnamese diacritic normalization for duplicate detection.
 *
 * Spec: normalize(s) strips Vietnamese diacritics + lowercases + trims so that
 * "Tôm sú" and "tom su" collide (NT-03.3, Red Team H7).
 */
import { vnNormalize } from "./vn-normalize";

describe("vnNormalize — diacritic stripping + case fold for duplicate detection", () => {
  describe("basic ASCII passthrough", () => {
    it("lowercases ASCII", () => {
      expect(vnNormalize("TOM SU")).toBe("tom su");
    });

    it("trims leading/trailing whitespace", () => {
      expect(vnNormalize("  tom su  ")).toBe("tom su");
    });

    it("collapses internal whitespace", () => {
      expect(vnNormalize("tom   su")).toBe("tom su");
    });
  });

  describe("Vietnamese diacritic removal", () => {
    it("strips tone marks from vowels", () => {
      // Tôm sú → tom su
      expect(vnNormalize("Tôm sú")).toBe("tom su");
    });

    it("strips tones from all common vowels", () => {
      expect(vnNormalize("à á â ã ä å")).toBe("a a a a a a");
      expect(vnNormalize("è é ê")).toBe("e e e");
      expect(vnNormalize("ì í")).toBe("i i");
      expect(vnNormalize("ò ó ô õ")).toBe("o o o o");
      expect(vnNormalize("ù ú")).toBe("u u");
    });

    it("handles Vietnamese-specific characters: đ", () => {
      expect(vnNormalize("đặc biệt")).toBe("dac biet");
    });

    it("handles ư and variations", () => {
      expect(vnNormalize("thịt ướp gia vị")).toBe("thit uop gia vi");
    });

    it("handles ơ and variations", () => {
      expect(vnNormalize("cơm tấm")).toBe("com tam");
    });

    it("handles ă and variations", () => {
      expect(vnNormalize("bắp cải")).toBe("bap cai");
    });

    it("handles full ingredient name collision (NT-03.3 spec example)", () => {
      // These must produce the same normalized string — the duplicate check
      // catches them even with different casing / spacing / diacritics.
      const a = vnNormalize("Tôm sú");
      const b = vnNormalize("tom su");
      expect(a).toBe(b);
    });

    it("detects duplicate across accent variants of the same ingredient", () => {
      expect(vnNormalize("Hải sản tươi")).toBe(vnNormalize("hai san tuoi"));
    });

    it("strips all Vietnamese uppercase diacritics", () => {
      expect(vnNormalize("THỊT BÒ")).toBe("thit bo");
    });
  });

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(vnNormalize("")).toBe("");
    });

    it("handles numbers and symbols unchanged (modulo case)", () => {
      expect(vnNormalize("NL-001 Tôm")).toBe("nl-001 tom");
    });

    it("multiple spaces between words collapse to one", () => {
      expect(vnNormalize("rau  củ   cải")).toBe("rau cu cai");
    });

    it("handles mixed ASCII + Vietnamese", () => {
      expect(vnNormalize("Gia vị-khô (spice)")).toBe("gia vi-kho (spice)");
    });
  });
});
