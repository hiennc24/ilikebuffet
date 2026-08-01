/**
 * Print client — POSTs a bill to the local print-agent.
 *
 * The agent runs on the counter machine (default http://127.0.0.1:7070). A print
 * failure is NEVER fatal to the sale: every function here swallows
 * errors and returns a boolean so callers can fire-and-forget.
 *
 * The payload shape mirrors @ilikebuffet/print-agent's PrintBillPayload; kept as
 * a local contract so the POS doesn't take a runtime dependency on the agent.
 */

const DEFAULT_AGENT_URL = "http://127.0.0.1:7070";
const AGENT_URL_KEY = "ibb_pos_print_agent";

export function getPrintAgentUrl(): string {
  return localStorage.getItem(AGENT_URL_KEY) ?? DEFAULT_AGENT_URL;
}

export interface PrintBillPayload {
  branchName: string;
  branchAddress?: string;
  billNumber: string;
  createdAt: string;
  cashierName?: string;
  lines: Array<{ name: string; qty: number; unitPriceVnd: number; lineTotalVnd: number }>;
  totalVnd: number;
  guestCount?: number;
  payments?: Array<{ method: string; amountVnd: number }>;
  footer?: string;
  isReprint?: boolean;
}

/**
 * Send a bill to the print-agent. Returns true if the agent accepted it.
 * Never throws — a down/uninstalled agent must not block the sale.
 */
export async function printBill(payload: PrintBillPayload, agentUrl = getPrintAgentUrl()): Promise<boolean> {
  try {
    const res = await fetch(`${agentUrl}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
