/**
 * draft-bill-store tests — persistence and clear behavior.
 *
 * Uses fake-indexeddb (auto-installed via import) so no browser env needed.
 * Each test gets a fresh PosDb instance to avoid cross-test bleed.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { PosDb, posDb } from "./pos-db";
import {
  getActiveDraft,
  saveDraft,
  clearDraft,
  getOrCreateClientUuid,
  clearClientUuid,
} from "./draft-bill-store";

// Swap posDb singleton to a fresh instance per test so each test starts clean.
// We can't re-import posDb (it's a singleton), so we operate via the real singleton
// but clear the table before each test.

beforeEach(async () => {
  await posDb.open();
  await posDb.draft_bills.clear();
  localStorage.clear();
});

afterEach(async () => {
  await posDb.draft_bills.clear();
  localStorage.clear();
});

describe("draft-bill-store — getActiveDraft / saveDraft / clearDraft", () => {
  it("returns undefined when no draft exists", async () => {
    const result = await getActiveDraft("branch-01");
    expect(result).toBeUndefined();
  });

  it("saveDraft inserts a new counter draft (tableId=null)", async () => {
    await saveDraft("branch-01", [
      { menuItemId: "tt-1", name: "Buffet người lớn", quantity: 2, unitPrice: 185000 },
    ]);
    const draft = await getActiveDraft("branch-01");
    expect(draft).toBeDefined();
    expect(draft!.tableId).toBeNull();
    expect(draft!.branchId).toBe("branch-01");
    expect(draft!.items).toHaveLength(1);
    expect(draft!.items[0].menuItemId).toBe("tt-1");
    expect(draft!.items[0].unitPrice).toBe(185000);
  });

  it("saveDraft updates existing draft (upsert — items replaced)", async () => {
    await saveDraft("branch-01", [
      { menuItemId: "tt-1", name: "Buffet người lớn", quantity: 1, unitPrice: 185000 },
    ]);

    const first = await getActiveDraft("branch-01");
    expect(first).toBeDefined();

    await saveDraft("branch-01", [
      { menuItemId: "tt-1", name: "Buffet người lớn", quantity: 3, unitPrice: 185000 },
      { menuItemId: "tt-2", name: "Trẻ em", quantity: 1, unitPrice: 90000 },
    ]);

    // Should still be one draft, not two.
    const allDrafts = await posDb.draft_bills.where("branchId").equals("branch-01").toArray();
    expect(allDrafts).toHaveLength(1);

    const updated = await getActiveDraft("branch-01");
    expect(updated!.items).toHaveLength(2);
    expect(updated!.items[0].quantity).toBe(3);
  });

  it("saveDraft does NOT create a record when items is empty and no existing draft", async () => {
    await saveDraft("branch-01", []);
    const draft = await getActiveDraft("branch-01");
    expect(draft).toBeUndefined();
  });

  it("clearDraft removes the counter draft", async () => {
    await saveDraft("branch-01", [
      { menuItemId: "tt-1", name: "Buffet người lớn", quantity: 1, unitPrice: 185000 },
    ]);
    await clearDraft("branch-01");
    const draft = await getActiveDraft("branch-01");
    expect(draft).toBeUndefined();
  });

  it("clearDraft is a no-op when no draft exists", async () => {
    await expect(clearDraft("branch-99")).resolves.toBeUndefined();
  });

  it("draft is isolated per branchId", async () => {
    await saveDraft("branch-01", [
      { menuItemId: "tt-1", name: "A", quantity: 1, unitPrice: 100000 },
    ]);
    await saveDraft("branch-02", [
      { menuItemId: "tt-2", name: "B", quantity: 2, unitPrice: 50000 },
    ]);

    const d1 = await getActiveDraft("branch-01");
    const d2 = await getActiveDraft("branch-02");

    expect(d1!.items[0].name).toBe("A");
    expect(d2!.items[0].name).toBe("B");
  });

  it("save → new store read hydrates the same items (simulates reload)", async () => {
    const items = [
      { menuItemId: "tt-1", name: "Buffet người lớn", quantity: 2, unitPrice: 185000 },
      { menuItemId: "tt-3", name: "Nước ngọt", quantity: 3, unitPrice: 25000 },
    ];
    await saveDraft("branch-01", items);

    // Simulate "reload" by creating a new PosDb instance pointing at same store.
    const db2 = new PosDb();
    await db2.open();

    const reloaded = await db2.draft_bills
      .where("branchId")
      .equals("branch-01")
      .filter((d) => d.tableId === null)
      .first();

    expect(reloaded).toBeDefined();
    expect(reloaded!.items).toHaveLength(2);
    expect(reloaded!.items[1].name).toBe("Nước ngọt");
    expect(Number.isInteger(reloaded!.items[0].unitPrice)).toBe(true);

    await db2.close();
  });
});

describe("draft-bill-store — clientUuid helpers", () => {
  it("getOrCreateClientUuid generates a UUID and persists it", () => {
    const uuid = getOrCreateClientUuid("branch-01");
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    // Same branch → same UUID.
    expect(getOrCreateClientUuid("branch-01")).toBe(uuid);
  });

  it("different branches get different UUIDs", () => {
    const u1 = getOrCreateClientUuid("branch-01");
    const u2 = getOrCreateClientUuid("branch-02");
    expect(u1).not.toBe(u2);
  });

  it("clearClientUuid removes the UUID so next call generates a new one", () => {
    const first = getOrCreateClientUuid("branch-01");
    clearClientUuid("branch-01");
    const second = getOrCreateClientUuid("branch-01");
    // Should be a new UUID (not the same as first).
    // In the rare case of UUID collision (astronomically unlikely) this still passes.
    expect(second).not.toBe(first);
  });
});
