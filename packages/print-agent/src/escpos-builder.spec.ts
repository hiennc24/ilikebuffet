import { buildReceipt, receiptToText, formatVnd, PrintBillPayload } from "./escpos-builder";

const BASE: PrintBillPayload = {
  branchName: "Chi nhánh Quận 1",
  branchAddress: "123 Nguyễn Huệ",
  billNumber: "CN01-260801-0007",
  createdAt: "2026-08-01T13:05:00+07:00",
  cashierName: "Lan",
  lines: [
    { name: "Người lớn", qty: 2, unitPriceVnd: 299000, lineTotalVnd: 598000 },
    { name: "Vé mời", qty: 1, unitPriceVnd: 0, lineTotalVnd: 0 },
  ],
  totalVnd: 598000,
  guestCount: 3,
  payments: [{ method: "CASH", amountVnd: 598000 }],
};

describe("formatVnd", () => {
  it("groups thousands with dots and appends đ", () => {
    expect(formatVnd(0)).toBe("0đ");
    expect(formatVnd(1000)).toBe("1.000đ");
    expect(formatVnd(598000)).toBe("598.000đ");
    expect(formatVnd(1234567)).toBe("1.234.567đ");
  });

  it("throws on NaN (defense-in-depth HI-6)", () => {
    expect(() => formatVnd(NaN)).toThrow(TypeError);
  });

  it("throws on Infinity (defense-in-depth HI-6)", () => {
    expect(() => formatVnd(Infinity)).toThrow(TypeError);
  });

  it("throws on a float (defense-in-depth HI-6)", () => {
    expect(() => formatVnd(99.5)).toThrow(TypeError);
  });
});

describe("buildReceipt", () => {
  it("includes branch, bill number, line items and total", () => {
    const text = receiptToText(buildReceipt(BASE));
    expect(text).toContain("Chi nhánh Quận 1");
    expect(text).toContain("CN01-260801-0007");
    expect(text).toContain("Người lớn");
    expect(text).toContain("2 x 299.000đ");
    expect(text).toContain("TỔNG CỘNG");
    expect(text).toContain("598.000đ");
    expect(text).toContain("Số khách");
    expect(text).toContain("Tiền mặt");
  });

  it("stamps a BẢN SAO banner on reprint", () => {
    expect(receiptToText(buildReceipt({ ...BASE, isReprint: true }))).toContain("BẢN SAO");
    expect(receiptToText(buildReceipt(BASE))).not.toContain("BẢN SAO");
  });

  it("starts with ESC @ init and ends with a GS V cut command", () => {
    const bytes = buildReceipt(BASE);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]); // ESC @
    const tail = Array.from(bytes.slice(-4));
    expect(tail).toEqual([0x1d, 0x56, 0x42, 0x00]); // GS V B 0
  });

  it("is deterministic for the same payload", () => {
    expect(Array.from(buildReceipt(BASE))).toEqual(Array.from(buildReceipt(BASE)));
  });
});
