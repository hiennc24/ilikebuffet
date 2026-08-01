/**
 * outbox-store tests — offline bill outbox persistence.
 *
 * Proves:
 *   - addToOutbox inserts with status="pending"
 *   - getPendingBills returns pending+retry, not committed/syncing
 *   - markCommitted sets officialNumber + status="committed"
 *   - markRetry increments attempts + sets lastError
 *   - clearCommitted removes committed bills (C5: only clear after officialNumber received)
 *   - countPending counts pending+retry+syncing
 *   - buildTempNumber format is correct and sequences increment per day
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { posDb } from "../db/pos-db";
import {
  addToOutbox,
  getPendingBills,
  markCommitted,
  markRetry,
  clearCommitted,
  countPending,
  buildTempNumber,
  resetTempSeq,
} from "./outbox-store";

const DEVICE_ID = "abcd-efgh-ijkl-mnop";
const BRANCH_ID = "branch-01";
const SHIFT_ID = "shift-01";
const BASE_BILL = {
  clientUuid: "uuid-001",
  tempNumber: "CN01-260801-T00010001",
  branchId: BRANCH_ID,
  shiftId: SHIFT_ID,
  deviceId: DEVICE_ID,
  createdAt: "2026-08-01T09:00:00.000Z",
  lines: [{ ticketTypeId: "tt-1", qty: 2 }],
};

beforeEach(async () => {
  await posDb.open();
  await posDb.offline_outbox.clear();
  localStorage.clear();
});

afterEach(async () => {
  await posDb.offline_outbox.clear();
  localStorage.clear();
});

describe("outbox-store — CRUD", () => {
  it("addToOutbox inserts bill with status=pending and attempts=0", async () => {
    const id = await addToOutbox(BASE_BILL);
    expect(typeof id).toBe("number");

    const stored = await posDb.offline_outbox.get(id);
    expect(stored).toBeDefined();
    expect(stored!.status).toBe("pending");
    expect(stored!.attempts).toBe(0);
    expect(stored!.clientUuid).toBe("uuid-001");
    expect(stored!.officialNumber).toBeUndefined();
  });

  it("getPendingBills returns pending and retry bills, not committed or syncing", async () => {
    await posDb.offline_outbox.bulkAdd([
      { ...BASE_BILL, clientUuid: "u1", status: "pending", attempts: 0 },
      { ...BASE_BILL, clientUuid: "u2", status: "retry", attempts: 1, lastError: "timeout" },
      { ...BASE_BILL, clientUuid: "u3", status: "committed", attempts: 1, officialNumber: "CN01-260801-0001" },
      { ...BASE_BILL, clientUuid: "u4", status: "syncing", attempts: 0 },
    ]);

    const pending = await getPendingBills(BRANCH_ID);
    const uuids = pending.map((b) => b.clientUuid);

    expect(uuids).toContain("u1");
    expect(uuids).toContain("u2");
    expect(uuids).not.toContain("u3");
    expect(uuids).not.toContain("u4");
  });

  it("markCommitted sets officialNumber and status=committed", async () => {
    await addToOutbox(BASE_BILL);

    await markCommitted("uuid-001", "CN01-260801-0042");

    const bill = await posDb.offline_outbox.where("clientUuid").equals("uuid-001").first();
    expect(bill!.status).toBe("committed");
    expect(bill!.officialNumber).toBe("CN01-260801-0042");
  });

  it("markRetry increments attempts and records lastError", async () => {
    await addToOutbox(BASE_BILL);
    // Initial attempts = 0
    await markRetry("uuid-001", "network_timeout");

    const bill = await posDb.offline_outbox.where("clientUuid").equals("uuid-001").first();
    expect(bill!.status).toBe("retry");
    expect(bill!.attempts).toBe(1);
    expect(bill!.lastError).toBe("network_timeout");

    // Second retry
    await markRetry("uuid-001", "server_error");
    const bill2 = await posDb.offline_outbox.where("clientUuid").equals("uuid-001").first();
    expect(bill2!.attempts).toBe(2);
  });

  it("clearCommitted removes only committed bills (C5: pending bills preserved)", async () => {
    await posDb.offline_outbox.bulkAdd([
      { ...BASE_BILL, clientUuid: "u1", status: "committed", attempts: 1, officialNumber: "CN01-260801-0001" },
      { ...BASE_BILL, clientUuid: "u2", status: "pending", attempts: 0 },
      { ...BASE_BILL, clientUuid: "u3", status: "retry", attempts: 2 },
    ]);

    await clearCommitted(BRANCH_ID);

    const remaining = await posDb.offline_outbox.toArray();
    const uuids = remaining.map((b) => b.clientUuid);

    expect(uuids).not.toContain("u1"); // committed → deleted
    expect(uuids).toContain("u2");     // pending → kept
    expect(uuids).toContain("u3");     // retry → kept
  });

  it("countPending counts pending + retry + syncing but not committed", async () => {
    await posDb.offline_outbox.bulkAdd([
      { ...BASE_BILL, clientUuid: "u1", status: "pending", attempts: 0 },
      { ...BASE_BILL, clientUuid: "u2", status: "retry", attempts: 1 },
      { ...BASE_BILL, clientUuid: "u3", status: "syncing", attempts: 0 },
      { ...BASE_BILL, clientUuid: "u4", status: "committed", attempts: 1, officialNumber: "X" },
    ]);

    const count = await countPending(BRANCH_ID);
    expect(count).toBe(3); // pending + retry + syncing
  });

  it("bills are isolated per branchId in getPendingBills", async () => {
    await posDb.offline_outbox.bulkAdd([
      { ...BASE_BILL, clientUuid: "u1", branchId: "branch-01", status: "pending", attempts: 0 },
      { ...BASE_BILL, clientUuid: "u2", branchId: "branch-02", status: "pending", attempts: 0 },
    ]);

    const branch01 = await getPendingBills("branch-01");
    const branch02 = await getPendingBills("branch-02");

    expect(branch01.map((b) => b.clientUuid)).toEqual(["u1"]);
    expect(branch02.map((b) => b.clientUuid)).toEqual(["u2"]);
  });
});

describe("outbox-store — buildTempNumber", () => {
  const BRANCH_CODE = "CN01";
  const CREATED_AT = new Date("2026-08-01T09:00:00.000Z");

  it("generates a correctly formatted temp number", () => {
    resetTempSeq(DEVICE_ID, BRANCH_ID, "2026-08-01");
    const tn = buildTempNumber(BRANCH_CODE, DEVICE_ID, BRANCH_ID, CREATED_AT);
    // Format: CN01-260801-T{DEVICE_SHORT}{NNN}
    // DEVICE_SHORT = first 4 non-hyphen chars of DEVICE_ID uppercased = "ABCD"
    expect(tn).toMatch(/^CN01-260801-T[A-Z0-9]{4}\d{3}$/);
  });

  it("sequences increment for the same device+branch+day", () => {
    resetTempSeq(DEVICE_ID, BRANCH_ID, "2026-08-01");
    const t1 = buildTempNumber(BRANCH_CODE, DEVICE_ID, BRANCH_ID, CREATED_AT);
    const t2 = buildTempNumber(BRANCH_CODE, DEVICE_ID, BRANCH_ID, CREATED_AT);
    const t3 = buildTempNumber(BRANCH_CODE, DEVICE_ID, BRANCH_ID, CREATED_AT);
    expect(t1).not.toBe(t2);
    expect(t2).not.toBe(t3);
    // All three should be distinct
    expect(new Set([t1, t2, t3]).size).toBe(3);
  });

  it("different devices get independent sequences (no cross-device collision)", () => {
    const device2 = "zzzz-1111-2222-3333";
    resetTempSeq(DEVICE_ID, BRANCH_ID, "2026-08-01");
    resetTempSeq(device2, BRANCH_ID, "2026-08-01");

    const t1 = buildTempNumber(BRANCH_CODE, DEVICE_ID, BRANCH_ID, CREATED_AT);
    const t2 = buildTempNumber(BRANCH_CODE, device2, BRANCH_ID, CREATED_AT);
    // Both seq=1 but device-short differs
    expect(t1).not.toBe(t2);
  });
});
