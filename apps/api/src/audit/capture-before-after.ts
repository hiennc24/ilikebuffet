/**
 * Normalise a before/after snapshot into an audit diff.
 *
 * - create (before = null): returns the full `after`.
 * - delete (after = null): returns the full `before`.
 * - update: returns ONLY the keys whose value changed, on both sides, so the
 *   audit row records exactly what moved (not the whole entity every time).
 *
 * Values are compared by JSON equality (sufficient for plain data records).
 */
export type Snapshot = Record<string, unknown> | null | undefined;

export interface AuditDiff {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

// BigInt is not JSON-serializable and would THROW inside the audit path (which
// may wrap a business tx) — coerce it to string so comparison never throws.
const jsonReplacer = (_key: string, value: unknown): unknown =>
  typeof value === "bigint" ? value.toString() : value;

function stableStringify(value: unknown): string {
  return JSON.stringify(value, jsonReplacer);
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return stableStringify(a) === stableStringify(b);
}

/**
 * An absent key (added/removed field) is recorded as explicit `null` rather
 * than `undefined`, so the "field was absent" signal survives JSON persistence
 * (JSON.stringify drops `undefined`).
 */
function sideValue(source: Record<string, unknown>, key: string): unknown {
  if (!(key in source)) return null;
  const v = source[key];
  return v === undefined ? null : v;
}

export function captureBeforeAfter(before: Snapshot, after: Snapshot): AuditDiff {
  const b = before ?? null;
  const a = after ?? null;

  if (b === null) return { before: null, after: a };
  if (a === null) return { before: b, after: null };

  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const key of keys) {
    if (!eq(b[key], a[key])) {
      changedBefore[key] = sideValue(b, key);
      changedAfter[key] = sideValue(a, key);
    }
  }
  return { before: changedBefore, after: changedAfter };
}
