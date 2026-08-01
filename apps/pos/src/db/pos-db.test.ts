/**
 * POS DB — Dexie draft_bills persistence test.
 *
 * Proves that a draft bill written to IndexedDB can be read back
 * from the same DB instance (simulates persistence across reload).
 *
 * Uses fake-indexeddb so no browser environment is needed.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { PosDb } from "./pos-db";
import type { DraftBill } from "./pos-db";

describe("PosDb — draft_bills table (H8 scaffold)", () => {
  let db: PosDb;

  beforeEach(async () => {
    // Fresh DB instance per test — fake-indexeddb keeps stores in memory.
    db = new PosDb();
    await db.open();
    await db.draft_bills.clear();
  });

  it("persists a draft bill and reads it back by id", async () => {
    const draft: DraftBill = {
      tableId: "table-3",
      branchId: "branch-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [
        { menuItemId: "item-1", name: "Lẩu thập cẩm", quantity: 1, unitPrice: 185000 },
        { menuItemId: "item-2", name: "Nước ngọt", quantity: 2, unitPrice: 25000 },
      ],
    };

    const id = await db.draft_bills.add(draft);
    expect(typeof id).toBe("number");

    const stored = await db.draft_bills.get(id);
    expect(stored).toBeDefined();
    expect(stored!.tableId).toBe("table-3");
    expect(stored!.items).toHaveLength(2);
    expect(stored!.items[0].name).toBe("Lẩu thập cẩm");
  });

  it("can query drafts by branchId index", async () => {
    await db.draft_bills.bulkAdd([
      {
        tableId: "t1",
        branchId: "branch-01",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [],
      },
      {
        tableId: "t2",
        branchId: "branch-02",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [],
      },
      {
        tableId: "t3",
        branchId: "branch-01",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [],
      },
    ]);

    const branch01Drafts = await db.draft_bills
      .where("branchId")
      .equals("branch-01")
      .toArray();

    expect(branch01Drafts).toHaveLength(2);
    expect(branch01Drafts.every((d) => d.branchId === "branch-01")).toBe(true);
  });

  it("draft survives a simulated DB reopen (same fake-indexeddb store)", async () => {
    const id = await db.draft_bills.add({
      tableId: null,
      branchId: "branch-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [{ menuItemId: "m1", name: "Phở bò", quantity: 1, unitPrice: 75000 }],
    });

    // Simulate "reopen" by closing and opening the same named DB.
    // fake-indexeddb persists data within the same process.
    await db.close();
    const db2 = new PosDb();
    await db2.open();

    const recovered = await db2.draft_bills.get(id);
    expect(recovered).toBeDefined();
    expect(recovered!.items[0].name).toBe("Phở bò");

    await db2.close();
  });

  it("draft_bills table exists and has the expected indexed fields", async () => {
    // Verify schema structure: ensure the table has branchId and tableId indexes.
    const schema = db.tables.find((t) => t.name === "draft_bills");
    expect(schema).toBeDefined();
    const indexNames = schema!.schema.indexes.map((i) => i.name);
    expect(indexNames).toContain("branchId");
    expect(indexNames).toContain("tableId");
  });

  it("stores items as array — unit prices remain integer VND (no float drift)", async () => {
    const id = await db.draft_bills.add({
      tableId: "t1",
      branchId: "branch-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [
        { menuItemId: "m1", name: "Cơm gà", quantity: 3, unitPrice: 55000 },
      ],
    });

    const stored = await db.draft_bills.get(id);
    const item = stored!.items[0];
    // unitPrice must be stored and retrieved as an integer.
    expect(Number.isInteger(item.unitPrice)).toBe(true);
    expect(item.unitPrice).toBe(55000);
  });
});
