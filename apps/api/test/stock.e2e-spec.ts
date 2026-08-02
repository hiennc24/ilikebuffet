/**
 * Stock issue/adjust + balance-view integration tests — real Postgres via
 * testcontainer.
 *
 * Covers: ISSUE reduces on-hand and is blocked past zero; ADJUST records the
 * signed delta and sets the count; the low-stock flag + lowOnly filter; movement
 * history; the balance == Σ movements invariant; and branch-scope denial.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { InventoryBalanceService } from "../src/inventory/inventory-balance.service";
import { StockService } from "../src/inventory/stock/stock.service";
import type { BranchAccess } from "../src/platform/rbac/branch-access";

const SCHEMA_PATH = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");

describe("stock issue/adjust (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let balance: InventoryBalanceService;
  let stock: StockService;

  const HQ: BranchAccess = { chainWide: true, branchIds: [] };
  const BRANCH = "st-branch";
  const OTHER = "st-other";
  const memberOther: BranchAccess = { chainWide: false, branchIds: [OTHER] };
  let beefId: string; // starts stocked, minStock 50
  let saltId: string; // starts empty, minStock 5 → low

  const balanceOf = (ingredientId: string) =>
    prisma.inventoryBalance.findUnique({ where: { branchId_ingredientId: { branchId: BRANCH, ingredientId } } });

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
    balance = new InventoryBalanceService();
    stock = new StockService(prisma, new AuditService(prisma), balance);

    for (const id of [BRANCH, OTHER]) {
      await prisma.branch.create({ data: { id, code: id.slice(-3).toUpperCase(), name: id, address: "x", phone: "0900000000" } });
    }
    const kg = await prisma.unit.create({ data: { code: "KG", name: "Kilogram" } });
    const group = await prisma.ingredientGroup.create({ data: { name: "Chung" } });
    beefId = (
      await prisma.ingredient.create({
        data: { code: "NL001", name: "Ba chỉ bò", groupId: group.id, unitId: kg.id, defaultMinStock: 50 },
      })
    ).id;
    saltId = (
      await prisma.ingredient.create({
        data: { code: "NL002", name: "Muối", groupId: group.id, unitId: kg.id, defaultMinStock: 5 },
      })
    ).id;

    // Seed 100 kg of beef @ 20000/kg.
    await prisma.withTx((tx) =>
      balance.applyDelta(tx, {
        branchId: BRANCH,
        ingredientId: beefId,
        type: "RECEIPT",
        qtyBase: 100,
        unitCostVnd: 20_000,
        createdBy: "seed",
      }),
    );
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("issues stock, reducing on-hand at the current average", async () => {
    const b = await stock.issue(
      { branchId: BRANCH, ingredientId: beefId, qty: 30, note: "hao hụt" },
      "thukho-1",
      "THU_KHO",
      HQ,
    );
    expect(b.qtyBase).toBe(70);
    expect(b.avgCostVnd).toBe(20_000);
    const moves = await prisma.stockMovement.findMany({ where: { branchId: BRANCH, ingredientId: beefId, type: "ISSUE" } });
    expect(moves).toHaveLength(1);
    expect(Number(moves[0].qtyBase)).toBe(-30);
  });

  it("blocks an issue larger than on-hand", async () => {
    await expect(
      stock.issue({ branchId: BRANCH, ingredientId: beefId, qty: 1000, note: "quá tay" }, "thukho-1", "THU_KHO", HQ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("adjusts on-hand to a counted quantity and records the delta", async () => {
    const b = await stock.adjust(
      { branchId: BRANCH, ingredientId: beefId, newQty: 65, note: "kiểm kê" },
      "thukho-1",
      "THU_KHO",
      HQ,
    );
    expect(b.qtyBase).toBe(65);
    const adj = await prisma.stockMovement.findMany({ where: { branchId: BRANCH, ingredientId: beefId, type: "ADJUST" } });
    expect(adj).toHaveLength(1);
    expect(Number(adj[0].qtyBase)).toBe(-5); // 70 → 65
  });

  it("keeps balance == Σ movements for the ingredient", async () => {
    const moves = await prisma.stockMovement.findMany({ where: { branchId: BRANCH, ingredientId: beefId } });
    const sum = moves.reduce((s, m) => s + Number(m.qtyBase), 0);
    const bal = await balanceOf(beefId);
    expect(Number(bal?.qtyBase)).toBeCloseTo(sum, 3);
  });

  it("lists stock with value + low-stock flag and filters lowOnly", async () => {
    // Give salt a low balance (2 kg, min 5).
    await stock.adjust({ branchId: BRANCH, ingredientId: saltId, newQty: 2, note: "mở kho" }, "thukho-1", "THU_KHO", HQ);

    const all = await stock.listStock({ branchId: BRANCH }, HQ);
    const beef = all.data.find((r) => r.ingredientId === beefId)!;
    expect(beef.valueVnd).toBe(65 * 20_000);
    expect(beef.lowStock).toBe(false);

    const low = await stock.listStock({ branchId: BRANCH, lowOnly: true }, HQ);
    expect(low.data.every((r) => r.lowStock)).toBe(true);
    expect(low.data.some((r) => r.ingredientId === saltId)).toBe(true);
    expect(low.data.some((r) => r.ingredientId === beefId)).toBe(false);
  });

  it("lists movement history newest-first", async () => {
    const res = await stock.listMovements({ branchId: BRANCH, ingredientId: beefId }, HQ);
    expect(res.total).toBeGreaterThanOrEqual(3); // RECEIPT + ISSUE + ADJUST
    expect(res.data[0].createdAt >= res.data[res.data.length - 1].createdAt).toBe(true);
  });

  it("denies issuing stock outside the caller's branch scope", async () => {
    await expect(
      stock.issue({ branchId: BRANCH, ingredientId: beefId, qty: 1, note: "x" }, "u", "THU_KHO", memberOther),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
