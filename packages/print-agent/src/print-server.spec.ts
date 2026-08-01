import { AddressInfo } from "node:net";
import { createPrintServer } from "./print-server";
import { LoopbackPrintDriver, FailingPrintDriver } from "./print-driver";
import { receiptToText, PrintBillPayload } from "./escpos-builder";

const BILL: PrintBillPayload = {
  branchName: "CN Quận 1",
  billNumber: "CN01-260801-0007",
  createdAt: "2026-08-01T13:05:00+07:00",
  lines: [{ name: "Người lớn", qty: 1, unitPriceVnd: 299000, lineTotalVnd: 299000 }],
  totalVnd: 299000,
};

async function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

function listen(handle: ReturnType<typeof createPrintServer>): Promise<number> {
  return new Promise((resolve) => {
    handle.server.listen(0, "127.0.0.1", () => {
      resolve((handle.server.address() as AddressInfo).port);
    });
  });
}

describe("print server", () => {
  it("prints a valid bill and captures the ESC/POS job (200)", async () => {
    const driver = new LoopbackPrintDriver();
    const handle = createPrintServer({ driver, log: () => {} });
    const port = await listen(handle);
    try {
      const res = await request(port, "POST", "/print", BILL);
      expect(res.status).toBe(200);
      expect(res.json.status).toBe("printed");
      expect(res.json.billNumber).toBe("CN01-260801-0007");
      expect(driver.jobs).toHaveLength(1);
      expect(receiptToText(driver.lastJob!)).toContain("CN01-260801-0007");
    } finally {
      handle.server.close();
    }
  });

  it("reports print failure as 502 WITHOUT throwing (non-blocking)", async () => {
    const handle = createPrintServer({ driver: new FailingPrintDriver("printer offline"), log: () => {} });
    const port = await listen(handle);
    try {
      const res = await request(port, "POST", "/print", BILL);
      expect(res.status).toBe(502);
      expect(res.json.status).toBe("print_failed");
      expect(res.json.error).toContain("printer offline");
    } finally {
      handle.server.close();
    }
  });

  it("rejects an invalid payload with 400", async () => {
    const handle = createPrintServer({ log: () => {} });
    const port = await listen(handle);
    try {
      const res = await request(port, "POST", "/print", { branchName: "x" });
      expect(res.status).toBe(400);
      expect(res.json.status).toBe("error");
    } finally {
      handle.server.close();
    }
  });

  it("serves /health with the driver name", async () => {
    const handle = createPrintServer({ log: () => {} });
    const port = await listen(handle);
    try {
      const res = await request(port, "GET", "/health");
      expect(res.status).toBe(200);
      expect(res.json).toEqual({ status: "ok", driver: "loopback" });
    } finally {
      handle.server.close();
    }
  });

  it("answers CORS preflight (OPTIONS 204) with the default POS origin", async () => {
    const handle = createPrintServer({ log: () => {} });
    const port = await listen(handle);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/print`, { method: "OPTIONS" });
      expect(res.status).toBe(204);
      // Default is the POS dev-server origin, not wildcard (ME-6 fix).
      expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5174");
    } finally {
      handle.server.close();
    }
  });

  it("honors an explicit allowOrigin override", async () => {
    const handle = createPrintServer({ allowOrigin: "https://pos.example.com", log: () => {} });
    const port = await listen(handle);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/print`, { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("https://pos.example.com");
    } finally {
      handle.server.close();
    }
  });
});

describe("validatePayload — money/qty guards (HI-6)", () => {
  let port: number;
  let handle: ReturnType<typeof createPrintServer>;

  beforeEach(async () => {
    handle = createPrintServer({ log: () => {} });
    port = await listen(handle);
  });
  afterEach(() => handle.server.close());

  const VALID = {
    branchName: "CN1",
    billNumber: "CN01-260801-0001",
    createdAt: "2026-08-01T10:00:00+07:00",
    lines: [{ name: "Người lớn", qty: 2, unitPriceVnd: 299000, lineTotalVnd: 598000 }],
    totalVnd: 598000,
  };

  it("accepts a valid integer-money payload (200)", async () => {
    const res = await request(port, "POST", "/print", VALID);
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("printed");
  });

  it("rejects NaN totalVnd (400)", async () => {
    const res = await request(port, "POST", "/print", { ...VALID, totalVnd: NaN });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/totalVnd/);
  });

  it("rejects Infinity totalVnd (400)", async () => {
    const res = await request(port, "POST", "/print", { ...VALID, totalVnd: Infinity });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/totalVnd/);
  });

  it("rejects float totalVnd (400)", async () => {
    const res = await request(port, "POST", "/print", { ...VALID, totalVnd: 598000.5 });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/totalVnd/);
  });

  it("rejects NaN unitPriceVnd on a line (400)", async () => {
    const lines = [{ name: "X", qty: 1, unitPriceVnd: NaN, lineTotalVnd: 100 }];
    const res = await request(port, "POST", "/print", { ...VALID, lines });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/unitPriceVnd/);
  });

  it("rejects float lineTotalVnd on a line (400)", async () => {
    const lines = [{ name: "X", qty: 1, unitPriceVnd: 100, lineTotalVnd: 99.9 }];
    const res = await request(port, "POST", "/print", { ...VALID, lines });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/lineTotalVnd/);
  });

  it("rejects qty = 0 (400)", async () => {
    const lines = [{ name: "X", qty: 0, unitPriceVnd: 100, lineTotalVnd: 0 }];
    const res = await request(port, "POST", "/print", { ...VALID, lines });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/qty/);
  });

  it("rejects negative qty (400)", async () => {
    const lines = [{ name: "X", qty: -1, unitPriceVnd: 100, lineTotalVnd: -100 }];
    const res = await request(port, "POST", "/print", { ...VALID, lines });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/qty/);
  });

  it("rejects fractional qty (400)", async () => {
    const lines = [{ name: "X", qty: 1.5, unitPriceVnd: 100, lineTotalVnd: 150 }];
    const res = await request(port, "POST", "/print", { ...VALID, lines });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/qty/);
  });
});
