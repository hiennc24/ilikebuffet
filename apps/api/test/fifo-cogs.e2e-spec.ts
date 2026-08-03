/**
 * FIFO cost-of-goods report (integration) — real Postgres via testcontainer.
 *
 * Two receipt lots at different prices are sold through the recipe-consumption
 * path; the FIFO report values the sale at real lot cost while the moving-average
 * COGS (and the on-hand average) are unchanged — proving the parallel view.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { InventoryBalanceService } from "../src/inventory/inventory-balance.service";
import { RecipeConsumptionService } from "../src/inventory/consumption/recipe-consumption.service";
import { InventoryReportsService } from "../src/inventory/reports/inventory-reports.service";
import type { BranchAccess } from "../src/platform/rbac/branch-access";

const SCHEMA = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");
const DAY = "2026-08-03";
const HQ: BranchAccess = { chainWide: true, branchIds: [] };

describe("FIFO COGS report (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let balance: InventoryBalanceService;
  let consumption: RecipeConsumptionService;
  let reports: InventoryReportsService;

  const BRANCH = "fifo-branch";
  const OTHER = "fifo-other";
  const memberOther: BranchAccess = { chainWide: false, branchIds: [OTHER] };
  let ingredientId: string;
  let ticketTypeId: string;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });

    prisma = new PrismaService();
    await prisma.$connect();
    balance = new InventoryBalanceService();
    consumption = new RecipeConsumptionService(prisma, balance);
    reports = new InventoryReportsService(prisma);

    for (const id of [BRANCH, OTHER]) {
      await prisma.branch.create({ data: { id, code: id.slice(-3).toUpperCase(), name: id, address: "x", phone: "0900000000" } });
    }
    const kg = await prisma.unit.create({ data: { code: "KG", name: "Kilogram" } });
    const group = await prisma.ingredientGroup.create({ data: { name: "Chung" } });
    ingredientId = (await prisma.ingredient.create({ data: { code: "NL001", name: "Bò", groupId: group.id, unitId: kg.id } })).id;
    ticketTypeId = (await prisma.ticketType.create({ data: { name: "VIP" } })).id;
    // Recipe: 12 kg per ticket (so a 1-ticket bill sells 12 kg).
    await prisma.ticketTypeRecipe.create({ data: { ticketTypeId, ingredientId, qtyBase: 12, branchId: null } });

    // Two lots: 10 @ 1000 then 10 @ 1500 → moving-average = 1250.
    await prisma.withTx(async (tx) => {
      await balance.applyDelta(tx, { branchId: BRANCH, ingredientId, type: "RECEIPT", qtyBase: 10, unitCostVnd: 1000, createdBy: "seed" });
      await balance.applyDelta(tx, { branchId: BRANCH, ingredientId, type: "RECEIPT", qtyBase: 10, unitCostVnd: 1500, createdBy: "seed" });
    });

    // A bill on DAY, then sell 12 kg through the consumption path (ISSUE refType BILL).
    const shift = await prisma.shift.create({ data: { branchId: BRANCH, deviceId: "dev", businessDate: new Date(`${DAY}T00:00:00Z`), status: "OPEN", openedBy: "seed", openingCashVnd: 0 } });
    const bill = await prisma.bill.create({
      data: { number: "FIFO-1", seq: 1, branchId: BRANCH, shiftId: shift.id, deviceId: "dev", businessDate: new Date(`${DAY}T00:00:00Z`), status: "COMPLETED", createdBy: "seed", totalVnd: 100_000, guestCount: 1 },
    });
    await prisma.withTx((tx) => consumption.consumeForBill(tx, { billId: bill.id, branchId: BRANCH, lines: [{ ticketTypeId, qty: 1 }] }, "cashier"));
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("values the sale at real lot (FIFO) cost", async () => {
    const r = await reports.fifoCogs({ branchId: BRANCH, from: DAY, to: DAY }, HQ);
    // 10 kg @1000 + 2 kg @1500 = 13_000.
    expect(r.totalCogsVnd).toBe(13_000);
    expect(r.byDay.find((d) => d.day === DAY)?.cogsVnd).toBe(13_000);
  });

  it("leaves the moving-average COGS and on-hand average unchanged", async () => {
    // Moving-average consumption: 12 kg @ 1250 = 15_000 (≠ FIFO 13_000).
    const mavg = await reports.consumption({ branchId: BRANCH }, HQ);
    expect(mavg.totalCogsVnd).toBe(15_000);
    const bal = await prisma.inventoryBalance.findUnique({ where: { branchId_ingredientId: { branchId: BRANCH, ingredientId } } });
    expect(bal?.avgCostVnd).toBe(1250);
    expect(Number(bal?.qtyBase)).toBeCloseTo(8, 3); // 20 − 12
  });

  it("confines FIFO COGS to the caller's branch scope and the period", async () => {
    expect((await reports.fifoCogs({}, memberOther)).totalCogsVnd).toBe(0);
    expect((await reports.fifoCogs({ from: "2026-09-01", to: "2026-09-30" }, HQ)).totalCogsVnd).toBe(0);
  });
});
