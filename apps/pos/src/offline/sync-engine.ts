/**
 * sync-engine — drives outbox → server sync for offline bills.
 *
 * Contract (bills are never lost):
 *   - Bills removed from outbox ONLY after receiving officialNumber from server.
 *   - Server returns full map {clientUuid → result} — never partial.
 *   - Retry bills with exponential back-off (max 5 attempts then flag for manual).
 *   - Syncs eagerly (per-bill) and in batches when coming back online.
 *
 * Usage: call triggerSync() whenever online status changes to true, or after
 * adding a bill to the outbox.
 */

import type { ApiClient } from "../lib/pos-api-client";
import {
  getPendingBills,
  markSyncing,
  markCommitted,
  markRetry,
} from "./outbox-store";
import type { OutboxBill } from "../db/pos-db";

export interface SyncBillResult {
  clientUuid: string;
  status: "committed" | "retry" | "rejected";
  officialNumber?: string;
  tempNumber: string;
  error?: string;
}

export interface SyncBatchResult {
  results: SyncBillResult[];
}

export interface SyncEngineCallbacks {
  onSyncComplete?: (results: SyncBillResult[]) => void;
  onSyncError?: (error: Error) => void;
}

const MAX_ATTEMPTS = 5;
// Exponential back-off caps at 30 seconds for UI responsiveness.
const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000] as const;

function backoffMs(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 30000;
}

export class SyncEngine {
  private syncing = false;
  private pendingSyncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly branchId: string,
    private readonly callbacks: SyncEngineCallbacks = {},
  ) {}

  /**
   * Trigger a sync cycle. Safe to call multiple times — only one cycle runs at
   * a time. If a sync is already running, a follow-up cycle is scheduled.
   */
  triggerSync(delayMs = 0): void {
    if (this.pendingSyncTimer !== null) {
      clearTimeout(this.pendingSyncTimer);
    }
    this.pendingSyncTimer = setTimeout(() => {
      this.pendingSyncTimer = null;
      void this.runSync();
    }, delayMs);
  }

  private async runSync(): Promise<void> {
    if (this.syncing) {
      // Schedule a follow-up after this cycle completes.
      this.triggerSync(1000);
      return;
    }

    this.syncing = true;
    try {
      const pending = await getPendingBills(this.branchId);
      if (pending.length === 0) return;

      const ids = pending
        .map((b) => b.id)
        .filter((id): id is number => id !== undefined);

      await markSyncing(ids);

      const batchPayload = { bills: pending.map(toSyncDto) };

      let batchResult: SyncBatchResult;
      try {
        batchResult = await this.api.post<SyncBatchResult>("/sales/bills/sync", batchPayload);
      } catch (err) {
        // Network-level failure — requeue all as retry
        for (const bill of pending) {
          const msg = err instanceof Error ? err.message : "network_error";
          await markRetry(bill.clientUuid, msg);
        }
        this.callbacks.onSyncError?.(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      // Process the full result map (C5: server always returns all)
      const resultMap = new Map(batchResult.results.map((r) => [r.clientUuid, r]));
      const settled: SyncBillResult[] = [];

      for (const bill of pending) {
        const result = resultMap.get(bill.clientUuid);
        if (!result) {
          // Should never happen — server must return full map (C5).
          // Treat as retry so we don't permanently lose the bill.
          await markRetry(bill.clientUuid, "missing_from_server_response");
          continue;
        }

        if (result.status === "committed" && result.officialNumber) {
          await markCommitted(bill.clientUuid, result.officialNumber);
          settled.push(result);
        } else if (result.status === "rejected") {
          // Server rejected authz — flag, don't retry indefinitely.
          await markRetry(bill.clientUuid, result.error ?? "rejected");
          settled.push(result);
        } else {
          // status="retry" — back off
          const attempts = (bill.attempts ?? 0) + 1;
          if (attempts >= MAX_ATTEMPTS) {
            // Cap reached — leave as retry so force-close path can handle it (H3).
            await markRetry(bill.clientUuid, `max_attempts_reached (${result.error ?? "unknown"})`);
          } else {
            await markRetry(bill.clientUuid, result.error ?? "server_retry");
            this.triggerSync(backoffMs(attempts));
          }
          settled.push(result);
        }
      }

      this.callbacks.onSyncComplete?.(settled);
    } finally {
      this.syncing = false;
    }
  }
}

// ─── DTO conversion ───────────────────────────────────────────────────────────

function toSyncDto(bill: OutboxBill) {
  return {
    clientUuid: bill.clientUuid,
    tempNumber: bill.tempNumber,
    branchId: bill.branchId,
    shiftId: bill.shiftId,
    deviceId: bill.deviceId,
    createdAt: bill.createdAt,
    deviceClockAt: bill.deviceClockAt,
    clockOffsetMs: bill.clockOffsetMs,
    lines: bill.lines,
    payments: bill.payments,
  };
}
