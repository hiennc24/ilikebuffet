/**
 * ESC/POS receipt builder for an 80mm thermal printer (BH-04).
 *
 * Produces the raw byte buffer for one bill. Kept dependency-free and pure so
 * it is trivially testable; the transport (USB/LAN) lives behind PrintDriver.
 *
 * NOTE (Sprint-0 / hardware): Vietnamese glyphs depend on the printer's
 * codepage. Text is emitted UTF-8 here; the concrete code-page selection
 * (ESC t n) is pinned once the two printer models are chosen (BH-04.6). Column
 * width assumes Font A at 80mm ≈ 48 characters.
 */

const ESC = 0x1b;
const GS = 0x1d;

/** 80mm Font A width in characters. */
export const RECEIPT_COLS = 48;

export interface PrintLine {
  name: string;
  qty: number;
  unitPriceVnd: number;
  lineTotalVnd: number;
}

export interface PrintPayment {
  method: string;
  amountVnd: number;
}

export interface PrintBillPayload {
  branchName: string;
  branchAddress?: string;
  billNumber: string;
  /** ISO timestamp. */
  createdAt: string;
  cashierName?: string;
  lines: PrintLine[];
  totalVnd: number;
  guestCount?: number;
  payments?: PrintPayment[];
  footer?: string;
  /** Reprint stamps a "BẢN SAO" banner and is logged by the caller (BH-04.5). */
  isReprint?: boolean;
}

/** Integer VND with '.' thousands separators — locale-data independent. */
export function formatVnd(amount: number): string {
  const neg = amount < 0;
  const digits = Math.abs(Math.trunc(amount)).toString();
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
    out += digits[i];
  }
  return `${neg ? "-" : ""}${out}đ`;
}

/** Left text + right text on one line, right-aligned to `width`, truncating left if needed. */
function twoCol(left: string, right: string, width = RECEIPT_COLS): string {
  const gap = width - left.length - right.length;
  if (gap >= 1) return left + " ".repeat(gap) + right;
  // Not enough room: truncate the left part.
  const keep = Math.max(0, width - right.length - 1);
  return left.slice(0, keep) + " " + right;
}

/**
 * Build the ESC/POS byte buffer for a bill. Deterministic given the payload.
 */
export function buildReceipt(payload: PrintBillPayload): Uint8Array {
  const chunks: Array<Uint8Array | string> = [];
  const push = (v: Uint8Array | string) => chunks.push(v);
  const line = (s = "") => push(s + "\n");
  const rule = () => line("-".repeat(RECEIPT_COLS));

  const alignCenter = () => push(new Uint8Array([ESC, 0x61, 0x01]));
  const alignLeft = () => push(new Uint8Array([ESC, 0x61, 0x00]));
  const boldOn = () => push(new Uint8Array([ESC, 0x45, 0x01]));
  const boldOff = () => push(new Uint8Array([ESC, 0x45, 0x00]));

  // Initialise printer.
  push(new Uint8Array([ESC, 0x40]));

  if (payload.isReprint) {
    alignCenter();
    boldOn();
    line("*** BẢN SAO ***");
    boldOff();
    line();
  }

  // Header.
  alignCenter();
  boldOn();
  line(payload.branchName);
  boldOff();
  if (payload.branchAddress) line(payload.branchAddress);
  line();
  alignLeft();

  // Bill meta.
  line(twoCol(`Số: ${payload.billNumber}`, formatDate(payload.createdAt)));
  if (payload.cashierName) line(`Thu ngân: ${payload.cashierName}`);
  rule();

  // Lines.
  for (const l of payload.lines) {
    line(l.name);
    line(twoCol(`  ${l.qty} x ${formatVnd(l.unitPriceVnd)}`, formatVnd(l.lineTotalVnd)));
  }
  rule();

  // Total.
  boldOn();
  line(twoCol("TỔNG CỘNG", formatVnd(payload.totalVnd)));
  boldOff();
  if (typeof payload.guestCount === "number") {
    line(twoCol("Số khách", String(payload.guestCount)));
  }

  // Payments.
  if (payload.payments?.length) {
    line();
    for (const p of payload.payments) {
      line(twoCol(paymentLabel(p.method), formatVnd(p.amountVnd)));
    }
  }

  // Footer.
  line();
  alignCenter();
  line(payload.footer ?? "Cảm ơn quý khách!");

  // Feed + partial cut.
  push(new Uint8Array([0x0a, 0x0a, 0x0a]));
  push(new Uint8Array([GS, 0x56, 0x42, 0x00]));

  return concatBytes(chunks);
}

function paymentLabel(method: string): string {
  switch (method.toUpperCase()) {
    case "CASH":
      return "Tiền mặt";
    case "VIETQR":
      return "VietQR";
    case "CARD":
      return "Thẻ";
    default:
      return method;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  // Render in VN local time.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${p(Number(get("minute")))}`;
}

function concatBytes(chunks: Array<Uint8Array | string>): Uint8Array {
  const encoded = chunks.map((c) => (typeof c === "string" ? new TextEncoder().encode(c) : c));
  const total = encoded.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of encoded) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Decode a built receipt back to text (drops control bytes) — for tests/preview. */
export function receiptToText(bytes: Uint8Array): string {
  // Strip the common ESC/GS control sequences so assertions read the content.
  const text = new TextDecoder().decode(bytes);
  // Remove ESC @ / ESC a n / ESC E n / GS V n control codes.
  return text
    .replace(/\x1b[@]/g, "")
    .replace(/\x1b[a]./g, "")
    .replace(/\x1b[E]./g, "")
    .replace(/\x1d[V]../g, "");
}
