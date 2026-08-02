import { BadRequestException } from "@nestjs/common";
import { InventoryBalanceService } from "./inventory-balance.service";
import type { TxClient } from "../prisma/prisma.service";

/**
 * Mock tx whose locked balance starts at (qty, avg). Captures the movement and
 * the balance update so tests can assert the moving-average + block-negative math.
 */
function makeTx(current: { qty: number; avg: number }) {
  const captured = {
    movement: undefined as Record<string, unknown> | undefined,
    balance: undefined as Record<string, unknown> | undefined,
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ qtyBase: String(current.qty), avgCostVnd: current.avg }]),
    stockMovement: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        captured.movement = data;
        return Promise.resolve(data);
      }),
    },
    inventoryBalance: {
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        captured.balance = data;
        return Promise.resolve(data);
      }),
    },
  };
  return { tx: tx as unknown as TxClient, captured };
}

describe("InventoryBalanceService", () => {
  const service = new InventoryBalanceService();
  const base = { branchId: "b1", ingredientId: "ing1", createdBy: "u1" };

  it("first RECEIPT into an empty balance takes the incoming cost", async () => {
    const { tx, captured } = makeTx({ qty: 0, avg: 0 });
    const result = await service.applyDelta(tx, {
      ...base,
      type: "RECEIPT",
      qtyBase: 10,
      unitCostVnd: 5000,
    });
    expect(result.qtyBase).toBe(10);
    expect(result.avgCostVnd).toBe(5000);
    expect(captured.movement).toMatchObject({ type: "RECEIPT", qtyBase: 10, unitCostVnd: 5000 });
  });

  it("second RECEIPT blends into a weighted moving average", async () => {
    // 10 @ 5000 already on hand; receive 30 @ 6000 → (10*5000 + 30*6000)/40 = 5750.
    const { tx } = makeTx({ qty: 10, avg: 5000 });
    const result = await service.applyDelta(tx, {
      ...base,
      type: "RECEIPT",
      qtyBase: 30,
      unitCostVnd: 6000,
    });
    expect(result.qtyBase).toBe(40);
    expect(result.avgCostVnd).toBe(5750);
  });

  it("ISSUE reduces on-hand and leaves the average unchanged", async () => {
    const { tx, captured } = makeTx({ qty: 40, avg: 5750 });
    const result = await service.applyDelta(tx, {
      ...base,
      type: "ISSUE",
      qtyBase: -15,
    });
    expect(result.qtyBase).toBe(25);
    expect(result.avgCostVnd).toBe(5750);
    // Goods leave valued at the current average.
    expect(captured.movement).toMatchObject({ type: "ISSUE", qtyBase: -15, unitCostVnd: 5750 });
  });

  it("blocks an ISSUE that would drive on-hand below zero", async () => {
    const { tx } = makeTx({ qty: 5, avg: 5000 });
    await expect(
      service.applyDelta(tx, { ...base, type: "ISSUE", qtyBase: -10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("ADJUST records the signed delta and sets the counted quantity", async () => {
    const { tx, captured } = makeTx({ qty: 25, avg: 5750 });
    const result = await service.setCounted(tx, { ...base, countedQtyBase: 22.5 });
    expect(result.qtyBase).toBe(22.5);
    expect(result.avgCostVnd).toBe(5750);
    expect(captured.movement).toMatchObject({ type: "ADJUST", qtyBase: -2.5 });
    expect(captured.balance).toMatchObject({ qtyBase: 22.5 });
  });

  it("rejects a negative stock-take count", async () => {
    const { tx } = makeTx({ qty: 25, avg: 5750 });
    await expect(
      service.setCounted(tx, { ...base, countedQtyBase: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
