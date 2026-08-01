import { describe, it, expect, vi, afterEach } from "vitest";
import { printBill, getPrintAgentUrl, type PrintBillPayload } from "./print-client";

const BILL: PrintBillPayload = {
  branchName: "CN Quận 1",
  billNumber: "CN01-260801-0007",
  createdAt: "2026-08-01T13:05:00+07:00",
  lines: [{ name: "Người lớn", qty: 2, unitPriceVnd: 299000, lineTotalVnd: 598000 }],
  totalVnd: 598000,
  payments: [{ method: "CASH", amountVnd: 598000 }],
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("printBill", () => {
  it("POSTs the bill to the agent's /print and returns true on 200", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ status: "printed" }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const ok = await printBill(BILL, "http://127.0.0.1:7070");
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:7070/print");
    expect(JSON.parse(String(init?.body)).billNumber).toBe("CN01-260801-0007");
  });

  it("returns false (never throws) when the agent is unreachable", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("connection refused"); }) as unknown as typeof fetch;
    await expect(printBill(BILL, "http://127.0.0.1:7070")).resolves.toBe(false);
  });

  it("returns false on a non-ok agent response", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 502 })) as unknown as typeof fetch;
    expect(await printBill(BILL)).toBe(false);
  });

  it("uses the configured agent URL from localStorage, else the default", () => {
    expect(getPrintAgentUrl()).toBe("http://127.0.0.1:7070");
    localStorage.setItem("ibb_pos_print_agent", "http://printer.local:9100");
    expect(getPrintAgentUrl()).toBe("http://printer.local:9100");
  });
});
