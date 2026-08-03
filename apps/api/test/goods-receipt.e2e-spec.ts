/**
 * Goods-receipt integration tests — real Postgres via testcontainer.
 *
 * Covers: purchase-unit → base conversion (thùng = 10 kg); RECEIPT movement +
 * balance update; weighted moving-average cost across two receipts; PO → RECEIVED;
 * and the SENT-only guard.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { InventoryBalanceService } from "../src/inventory/inventory-balance.service";
import { PurchaseOrdersService } from "../src/inventory/purchase-orders/purchase-orders.service";
import { GoodsReceiptService } from "../src/inventory/receipts/goods-receipt.service";
import type { BranchAccess } from "../src/platform/rbac/branch-access";

const SCHEMA_PATH = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");

describe("goods receipt (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let orders: PurchaseOrdersService;
  let receipts: GoodsReceiptService;

  const HQ: BranchAccess = { chainWide: true, branchIds: [] };
  const BRANCH = "gr-branch";
  let supplierId: string;
  let ingredientId: string;
  let thungUnitId: string;

  const balanceOf = () =>
    prisma.inventoryBalance.findUnique({
      where: { branchId_ingredientId: { branchId: BRANCH, ingredientId } },
    });

  const orderAndSend = async (qty: number, unitPriceVnd: number) => {
    const po = await orders.create(
      { branchId: BRANCH, supplierId, lines: [{ ingredientId, unitId: thungUnitId, qty, unitPriceVnd }] },
      "thukho-1",
      "THU_KHO",
      HQ,
    );
    await orders.send(po.id, "thukho-1", "THU_KHO", HQ);
    return po;
  };

  beforeAll(async () => {
    db = await startTestDb();
    delete process.env.APP_DATABASE_URL;
    process.env.DATABASE_URL = db.url;
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA_PATH], {
      env: { ...process.env, DATABASE_URL: db.url },
      stdio: "inherit",
    });

    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const balance = new InventoryBalanceService();
    orders = new PurchaseOrdersService(prisma, audit);
    receipts = new GoodsReceiptService(prisma, audit, balance);

    // High threshold: this suite sends POs directly (approval has its own spec).
    await prisma.branch.create({ data: { id: BRANCH, code: "GRB", name: "GRB", address: "x", phone: "0900000000", poApprovalThresholdVnd: 100_000_000 } });
    const kg = await prisma.unit.create({ data: { code: "KG", name: "Kilogram" } });
    const thung = await prisma.unit.create({ data: { code: "THUNG", name: "Thùng" } });
    thungUnitId = thung.id;
    const group = await prisma.ingredientGroup.create({ data: { name: "Thịt" } });
    const ing = await prisma.ingredient.create({
      data: {
        code: "NL001",
        name: "Ba chỉ bò",
        groupId: group.id,
        unitId: kg.id,
        purchaseUnits: { create: { unitId: thung.id, factorToBase: 10 } },
      },
    });
    ingredientId = ing.id;
    supplierId = (await prisma.supplier.create({ data: { name: "NCC 1" } })).id;
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("receives a SENT PO: converts to base units, books stock, sets PO RECEIVED", async () => {
    const po = await orderAndSend(3, 300_000); // 3 thùng @ 300k
    const res = await receipts.receive(po.id, {}, "thukho-1", "THU_KHO", HQ);

    expect(res.status).toBe("RECEIVED");
    // 3 thùng × 10 kg = 30 kg on hand; 900000 / 30 = 30000 per kg.
    expect(res.received[0].receivedQtyBase).toBe(30);
    expect(res.received[0].avgCostVnd).toBe(30_000);

    const bal = await balanceOf();
    expect(Number(bal?.qtyBase)).toBe(30);
    expect(bal?.avgCostVnd).toBe(30_000);

    const moves = await prisma.stockMovement.findMany({ where: { branchId: BRANCH, ingredientId } });
    expect(moves).toHaveLength(1);
    expect(moves[0].type).toBe("RECEIPT");

    const reloaded = await prisma.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(reloaded?.status).toBe("RECEIVED");

    // A supplier payable (công nợ NCC) is opened for the received value (E3/F2).
    const payable = await prisma.supplierPayable.findFirst({ where: { poId: po.id } });
    expect(payable?.amountVnd).toBe(900_000); // 3 thùng × 300k
    expect(payable?.status).toBe("OPEN");
  });

  it("blends the moving-average cost across a second receipt", async () => {
    const po = await orderAndSend(2, 360_000); // 2 thùng @ 360k → 20 kg @ 36000/kg
    const res = await receipts.receive(po.id, {}, "thukho-1", "THU_KHO", HQ);

    // (30×30000 + 20×36000) / 50 = 1_620_000 / 50 = 32_400.
    expect(res.received[0].onHandQtyBase).toBe(50);
    expect(res.received[0].avgCostVnd).toBe(32_400);
  });

  it("honours a per-line price and qty override", async () => {
    const po = await orderAndSend(5, 300_000);
    const res = await receipts.receive(
      po.id,
      { lines: [{ ingredientId, unitId: thungUnitId, qty: 1, unitPriceVnd: 500_000 }] },
      "thukho-1",
      "THU_KHO",
      HQ,
    );
    // Only 1 thùng (10 kg) received at the overridden price; on-hand 50 → 60.
    expect(res.received[0].receivedQtyBase).toBe(10);
    expect(res.received[0].onHandQtyBase).toBe(60);
  });

  it("refuses to receive a PO that is not SENT", async () => {
    const draft = await orders.create(
      { branchId: BRANCH, supplierId, lines: [{ ingredientId, unitId: thungUnitId, qty: 1, unitPriceVnd: 100_000 }] },
      "thukho-1",
      "THU_KHO",
      HQ,
    );
    await expect(receipts.receive(draft.id, {}, "thukho-1", "THU_KHO", HQ)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
