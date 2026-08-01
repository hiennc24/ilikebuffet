/**
 * Money = integer VND (đồng). Never float.
 *
 * VND has no sub-unit in practice; storing money as a float invites silent
 * drift (0.1 + 0.2 !== 0.3) that corrupts bills, splits and reconciliation.
 * Every value crossing a money boundary must be an integer number of đồng.
 */

/** An amount of money in integer đồng (VND). Enforced at runtime by helpers. */
export type VndAmount = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Throw unless `value` is a finite, safe integer number of đồng. */
export function assertVndInteger(value: number): asserts value is VndAmount {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`VND amount must be finite, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`VND amount must be an integer đồng, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`VND amount exceeds safe integer range: ${value}`);
  }
}

/** Round an arbitrary numeric money value to the nearest integer đồng (half-up). */
export function roundVnd(value: number): VndAmount {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Cannot round non-finite value ${value}`);
  }
  // Math.round is half-up for positive values, which is what we want for VND.
  return Math.round(value);
}

/**
 * Split `total` đồng into `parts` integer shares that sum EXACTLY to `total`.
 * The remainder (0..parts-1 đồng) is distributed one đồng at a time to the
 * earliest shares, so no đồng is ever lost or invented.
 */
export function splitVndEvenly(total: VndAmount, parts: number): VndAmount[] {
  assertVndInteger(total);
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new MoneyError(`parts must be a positive integer, got ${parts}`);
  }
  const base = Math.floor(total / parts);
  let remainder = total - base * parts;
  const shares: VndAmount[] = [];
  for (let i = 0; i < parts; i++) {
    shares.push(remainder > 0 ? base + 1 : base);
    if (remainder > 0) remainder--;
  }
  return shares;
}

/** Apply a percentage to a money amount, returning integer đồng (rounded). */
export function applyPercent(amount: VndAmount, percent: number): VndAmount {
  assertVndInteger(amount);
  if (!Number.isFinite(percent)) {
    throw new MoneyError(`percent must be finite, got ${percent}`);
  }
  const product = amount * percent;
  // Guard the PRODUCT: once |amount * percent| exceeds MAX_SAFE_INTEGER it has
  // already lost precision, and dividing by 100 can hide that behind a value
  // that looks like a safe integer. Reject rather than return a corrupted đồng.
  if (Math.abs(product) > Number.MAX_SAFE_INTEGER) {
    throw new MoneyError(`percentage math overflows safe integer range: ${amount} * ${percent}`);
  }
  return roundVnd(product / 100);
}

/**
 * Multiply an integer đồng amount by an integer count (e.g. unit price × qty).
 * Both operands must be integers, so the product is exact; guarded against
 * overflowing the safe-integer range.
 */
export function multiplyVnd(amount: VndAmount, count: number): VndAmount {
  assertVndInteger(amount);
  if (!Number.isInteger(count) || count < 0) {
    throw new MoneyError(`count must be a non-negative integer, got ${count}`);
  }
  const product = amount * count;
  if (Math.abs(product) > Number.MAX_SAFE_INTEGER) {
    throw new MoneyError(`money multiplication overflows safe integer range: ${amount} * ${count}`);
  }
  return product;
}

const vndFormatter = new Intl.NumberFormat("vi-VN");

/** Format integer đồng for vi-VN display, e.g. 150000 -> "150.000 ₫". */
export function formatVnd(amount: VndAmount): string {
  assertVndInteger(amount);
  return `${vndFormatter.format(amount)} ₫`;
}
