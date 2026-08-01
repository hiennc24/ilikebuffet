/**
 * Local HTTP print server (BH-04). The POS PWA POSTs a bill payload here; the
 * agent renders ESC/POS and hands it to the configured PrintDriver.
 *
 * Contract with the POS (BH-04.4): a print failure is reported (HTTP 502) but is
 * NEVER fatal to the sale — the POS has already saved/settled the bill server-
 * side and treats printing as best-effort. The agent therefore only prints; it
 * has no bill-numbering or money authority.
 *
 * H6 (transport): a PWA served over HTTPS calling http://localhost is blocked as
 * mixed content by browsers. M1 runs the POS and agent on the same machine; the
 * production story (loopback TLS / agent-hosted origin) is pinned at Sprint-0.
 * CORS is enabled so the browser can reach the loopback origin.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from "node:http";
import { buildReceipt, PrintBillPayload } from "./escpos-builder";
import { PrintDriver, LoopbackPrintDriver } from "./print-driver";

export interface PrintServerOptions {
  driver?: PrintDriver;
  /**
   * Allowed CORS origin for the POS PWA.
   * Default: "http://localhost:5174" (Vite POS dev server).
   * Override with PRINT_AGENT_ORIGIN env var in production.
   *
   * /print is intentionally unauthenticated for M1: the agent is a
   * local actuator bound to 127.0.0.1 with no money authority.
   * Origin-locking is the first-line control (accepted risk Sprint-0 H6).
   */
  allowOrigin?: string;
  /** Optional log sink (defaults to console). */
  log?: (msg: string) => void;
}

export interface PrintServerHandle {
  server: Server;
  driver: PrintDriver;
}

const MAX_BODY_BYTES = 256 * 1024;

/** Returns undefined on success, or an error message naming the offending field. */
function validatePayload(body: unknown): { error: string } | undefined {
  if (!body || typeof body !== "object") return { error: "payload must be a JSON object" };
  const b = body as Record<string, unknown>;

  if (typeof b.branchName !== "string") return { error: "branchName must be a string" };
  if (typeof b.billNumber !== "string") return { error: "billNumber must be a string" };
  if (typeof b.createdAt !== "string") return { error: "createdAt must be a string" };
  if (!Array.isArray(b.lines)) return { error: "lines must be an array" };
  if (!isVndInteger(b.totalVnd)) return { error: "totalVnd must be a finite integer >= 0" };

  for (let i = 0; i < (b.lines as unknown[]).length; i++) {
    const l = (b.lines as unknown[])[i];
    if (!l || typeof l !== "object") return { error: `lines[${i}] must be an object` };
    const lf = l as Record<string, unknown>;
    if (!isPositiveInteger(lf.qty)) return { error: `lines[${i}].qty must be a positive integer (>= 1)` };
    if (!isVndInteger(lf.unitPriceVnd)) return { error: `lines[${i}].unitPriceVnd must be a finite integer >= 0` };
    if (!isVndInteger(lf.lineTotalVnd)) return { error: `lines[${i}].lineTotalVnd must be a finite integer >= 0` };
  }

  return undefined; // valid
}

/** True when x is a finite integer >= 0 (valid VND amount). */
function isVndInteger(x: unknown): boolean {
  return typeof x === "number" && Number.isInteger(x) && Number.isFinite(x) && x >= 0;
}

/** True when x is a finite integer >= 1 (valid ticket quantity). */
function isPositiveInteger(x: unknown): boolean {
  return typeof x === "number" && Number.isInteger(x) && x >= 1;
}

/**
 * Create (but do not start) the print HTTP server. Call `.listen(port, host)`.
 * Bind to 127.0.0.1 in production so the agent is not reachable off-box.
 */
export function createPrintServer(opts: PrintServerOptions = {}): PrintServerHandle {
  const driver = opts.driver ?? new LoopbackPrintDriver();
  const allowOrigin = opts.allowOrigin ?? "http://localhost:5174";
  const log = opts.log ?? ((m: string) => console.log(`[print-agent] ${m}`));

  const server = createServer((req, res) => handle(req, res, driver, allowOrigin, log));
  return { server, driver };
}

function cors(res: ServerResponse, allowOrigin: string): void {
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  driver: PrintDriver,
  allowOrigin: string,
  log: (msg: string) => void,
): Promise<void> {
  cors(res, allowOrigin);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { status: "ok", driver: driver.name });
    return;
  }

  if (req.method === "POST" && req.url === "/print") {
    let received = 0;
    const parts: Buffer[] = [];
    let aborted = false;
    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        aborted = true;
        json(res, 413, { status: "error", error: "payload too large" });
        req.destroy();
        return;
      }
      parts.push(chunk);
    });
    req.on("end", async () => {
      if (aborted) return;
      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(parts).toString("utf8"));
      } catch {
        json(res, 400, { status: "error", error: "invalid JSON" });
        return;
      }
      const validationError = validatePayload(payload);
      if (validationError) {
        json(res, 400, { status: "error", error: validationError.error });
        return;
      }
      const bill = payload as PrintBillPayload;
      const bytes = buildReceipt(bill);
      try {
        await driver.print(bytes);
        log(`printed bill ${bill.billNumber}${bill.isReprint ? " (BẢN SAO)" : ""} via ${driver.name}`);
        json(res, 200, { status: "printed", billNumber: bill.billNumber, bytes: bytes.length });
      } catch (err) {
        // BH-04.4: report failure; the POS does NOT treat this as fatal.
        const message = err instanceof Error ? err.message : String(err);
        log(`print FAILED for bill ${bill.billNumber}: ${message}`);
        json(res, 502, { status: "print_failed", billNumber: bill.billNumber, error: message });
      }
    });
    return;
  }

  json(res, 404, { status: "error", error: "not found" });
}
