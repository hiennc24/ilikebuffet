/**
 * Vietnamese text normalization for duplicate detection (NT-03.3, Red Team H7).
 *
 * vnNormalize(s) → strips diacritics + lowercases + collapses whitespace so that
 * "Tôm sú" and "tom su" produce the same string, enabling collision detection
 * in the Excel import pipeline without hard-coding Vietnamese character lists.
 *
 * Implementation: Unicode NFD decomposition breaks combined characters into
 * base + combining mark codepoints; the regex then removes all combining marks
 * (Unicode category Mn). The Vietnamese letter "đ/Đ" does not decompose via
 * NFD — it is handled explicitly.
 */

/** Regex matching all Unicode combining diacritical marks (category Mn). */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Normalize a Vietnamese string for case-insensitive, diacritic-insensitive
 * duplicate detection.
 *
 * Steps:
 *  1. Replace đ/Đ explicitly (NFD does not decompose it).
 *  2. NFD-decompose to isolate combining marks.
 *  3. Strip combining marks.
 *  4. Lowercase.
 *  5. Collapse runs of whitespace; trim.
 */
export function vnNormalize(s: string): string {
  return s
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
