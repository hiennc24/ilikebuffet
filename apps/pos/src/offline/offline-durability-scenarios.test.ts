/**
 * Client-durability acceptance scenarios (a, d): an offline bill must
 * never be lost. These complement the server-side arbiter scenarios
 * (apps/api/test/sync-scenarios.e2e-spec.ts). Uses fake-indexeddb; closing and
 * reopening posDb simulates a page reload / power loss.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { posDb } from "../db/pos-db";
import { addToOutbox, getPendingBills, countPending, clearCommitted, markCommitted, hasStuckBills } from "./outbox-store";

function draft(uuid: string) {
  return {
    clientUuid: uuid,
    tempNumber: `CN01-260801-TDEV${uuid.slice(-3)}`,
    branchId: "branch-1",
    shiftId: "shift-1",
    deviceId: "dev-A",
    createdAt: "2026-08-01T13:00:00+07:00",
    lines: [{ ticketTypeId: "tt-1", qty: 2 }],
  };
}

beforeEach(async () => {
  await posDb.offline_outbox.clear();
});

describe("offline durability — scenarios (a, d)", () => {
  it("(a) a bill queued when the network drops at payment stays pending until it has an official number", async () => {
    await addToOutbox(draft("aaa-001"));
    expect(await countPending("branch-1")).toBe(1);

    // clearCommitted must NOT remove a bill that has no official number yet.
    await clearCommitted("branch-1");
    expect(await countPending("branch-1")).toBe(1);

    // Only after the server returns the official number is it cleared.
    await markCommitted("aaa-001", "CN01-260801-0001");
    await clearCommitted("branch-1");
    expect(await countPending("branch-1")).toBe(0);
  });

  it("(d) 20 bills created offline survive a simulated power loss (close + reopen DB)", async () => {
    for (let i = 0; i < 20; i++) await addToOutbox(draft(`bulk-${String(i).padStart(3, "0")}`));
    expect(await countPending("branch-1")).toBe(20);

    // Simulate power loss / app restart: close the DB and reopen it.
    posDb.close();
    await posDb.open();

    const pending = await getPendingBills("branch-1");
    expect(pending).toHaveLength(20);
    // No duplicates, all clientUuids preserved.
    expect(new Set(pending.map((b) => b.clientUuid)).size).toBe(20);
  });

  it("flags a bill stuck in the outbox >15 min", async () => {
    const now = Date.parse("2026-08-01T14:00:00+07:00");
    await addToOutbox({ ...draft("stuck-1"), createdAt: new Date(now - 20 * 60 * 1000).toISOString() });
    expect(await hasStuckBills("branch-1", 15 * 60 * 1000, now)).toBe(true);

    await posDb.offline_outbox.clear();
    await addToOutbox({ ...draft("fresh-1"), createdAt: new Date(now - 2 * 60 * 1000).toISOString() });
    expect(await hasStuckBills("branch-1", 15 * 60 * 1000, now)).toBe(false);
  });
});
