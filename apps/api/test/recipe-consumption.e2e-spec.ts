/**
 * Recipe consumption integration tests — real Postgres via testcontainer.
 *
 * Covers: consumeForBill aggregates Σ(recipe × ticket qty) per ingredient across
 * mixed ticket lines; on-hand may go negative; average is untouched; reverseForBill
 * restores exactly and is idempotent; a ticket type without a recipe consumes
 * nothing.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { InventoryBalanceService } from "../src/inventory/inventory-balance.service";
import { RecipeConsumptionService } from "../src/inventory/consumption/recipe-consumption.service";

const SCHEMA_PATH = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");

describe("recipe consumption (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let balance: InventoryBalanceService;
  let consumption: RecipeConsumptionService;

  const BRANCH = "rc-branch";
  let adultId: string;
  let childId: string;
  let freeId: string;
  let beefId: string;
  let riceId: string;

  const qtyOf = (ingredientId: string) =>
    prisma.inventoryBalance
      .findUnique({ where: { branchId_ingredientId: { branchId: BRANCH, ingredientId } } })
      .then((b) => (b ? Number(b.qtyBase) : 0));

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
    consumption = new RecipeConsumptionService(prisma, balance);

    await prisma.branch.create({ data: { id: BRANCH, code: "RCB", name: "RCB", address: "x", phone: "0900000000" } });
    const kg = await prisma.unit.create({ data: { code: "KG", name: "Kilogram" } });
    const group = await prisma.ingredientGroup.create({ data: { name: "Chung" } });
    beefId = (await prisma.ingredient.create({ data: { code: "NL001", name: "Bò", groupId: group.id, unitId: kg.id } })).id;
    riceId = (await prisma.ingredient.create({ data: { code: "NL002", name: "Gạo", groupId: group.id, unitId: kg.id } })).id;

    adultId = (await prisma.ticketType.create({ data: { name: "Người lớn" } })).id;
    childId = (await prisma.ticketType.create({ data: { name: "Trẻ em" } })).id;
    freeId = (await prisma.ticketType.create({ data: { name: "Miễn phí", isFree: true } })).id;

    // Recipes: adult → 0.2 bò + 0.15 gạo; child → 0.1 bò + 0.1 gạo; free → 0.1 gạo.
    await prisma.ticketTypeRecipe.createMany({
      data: [
        { ticketTypeId: adultId, ingredientId: beefId, qtyBase: 0.2 },
        { ticketTypeId: adultId, ingredientId: riceId, qtyBase: 0.15 },
        { ticketTypeId: childId, ingredientId: beefId, qtyBase: 0.1 },
        { ticketTypeId: childId, ingredientId: riceId, qtyBase: 0.1 },
        { ticketTypeId: freeId, ingredientId: riceId, qtyBase: 0.1 },
      ],
    });

    // Seed 100 kg each @ 20000.
    await prisma.withTx(async (tx) => {
      await balance.applyDelta(tx, { branchId: BRANCH, ingredientId: beefId, type: "RECEIPT", qtyBase: 100, unitCostVnd: 20_000, createdBy: "seed" });
      await balance.applyDelta(tx, { branchId: BRANCH, ingredientId: riceId, type: "RECEIPT", qtyBase: 100, unitCostVnd: 20_000, createdBy: "seed" });
    });
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("aggregates consumption across mixed ticket lines (incl. free)", async () => {
    await prisma.withTx((tx) =>
      consumption.consumeForBill(
        tx,
        { billId: "bill-1", branchId: BRANCH, lines: [{ ticketTypeId: adultId, qty: 3 }, { ticketTypeId: childId, qty: 2 }, { ticketTypeId: freeId, qty: 1 }] },
        "cashier-1",
      ),
    );
    // beef = 0.2*3 + 0.1*2 = 0.8 → 99.2 ; rice = 0.15*3 + 0.1*2 + 0.1*1 = 0.75 → 99.25
    expect(await qtyOf(beefId)).toBeCloseTo(99.2, 3);
    expect(await qtyOf(riceId)).toBeCloseTo(99.25, 3);

    const beef = await prisma.inventoryBalance.findUnique({ where: { branchId_ingredientId: { branchId: BRANCH, ingredientId: beefId } } });
    expect(beef?.avgCostVnd).toBe(20_000); // average untouched

    const moves = await prisma.stockMovement.findMany({ where: { refType: "BILL", refId: "bill-1" } });
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.type === "ISSUE")).toBe(true);
  });

  it("reverses a cancelled bill exactly and is idempotent", async () => {
    await prisma.withTx((tx) => consumption.reverseForBill(tx, "bill-1", "manager-1"));
    expect(await qtyOf(beefId)).toBeCloseTo(100, 3);
    expect(await qtyOf(riceId)).toBeCloseTo(100, 3);

    // Second reverse must not double-add.
    await prisma.withTx((tx) => consumption.reverseForBill(tx, "bill-1", "manager-1"));
    expect(await qtyOf(beefId)).toBeCloseTo(100, 3);
    const reversals = await prisma.stockMovement.findMany({ where: { refType: "BILL_REVERSAL", refId: "bill-1" } });
    expect(reversals).toHaveLength(2); // one per ingredient, not four
  });

  it("allows a sale to drive on-hand negative", async () => {
    // Fresh ingredient with only 1 kg but a 5-ticket adult bill needs 1.0 kg beef... use a tight case.
    const { id: sauceId } = await prisma.ingredient.create({ data: { code: "NL003", name: "Sốt", groupId: (await prisma.ingredientGroup.findFirst())!.id, unitId: (await prisma.unit.findFirst())!.id } });
    await prisma.ticketTypeRecipe.create({ data: { ticketTypeId: adultId, ingredientId: sauceId, qtyBase: 1 } });
    await prisma.withTx((tx) => balance.applyDelta(tx, { branchId: BRANCH, ingredientId: sauceId, type: "RECEIPT", qtyBase: 1, unitCostVnd: 1000, createdBy: "seed" }));

    await prisma.withTx((tx) =>
      consumption.consumeForBill(tx, { billId: "bill-2", branchId: BRANCH, lines: [{ ticketTypeId: adultId, qty: 3 }] }, "cashier-1"),
    );
    // 1 − 3 = −2 (sale not blocked).
    expect(await qtyOf(sauceId)).toBeCloseTo(-2, 3);
  });

  it("consumes nothing for a ticket type with no recipe", async () => {
    const noRecipe = await prisma.ticketType.create({ data: { name: "Không định mức" } });
    await prisma.withTx((tx) =>
      consumption.consumeForBill(tx, { billId: "bill-3", branchId: BRANCH, lines: [{ ticketTypeId: noRecipe.id, qty: 5 }] }, "cashier-1"),
    );
    const moves = await prisma.stockMovement.findMany({ where: { refId: "bill-3" } });
    expect(moves).toHaveLength(0);
  });
});
