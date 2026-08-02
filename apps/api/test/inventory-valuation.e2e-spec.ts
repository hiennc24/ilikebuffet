/**
 * Inventory valuation report integration tests — real Postgres via testcontainer.
 *
 * Covers: total value = Σ roundVnd(qty × avgCost); per-group and per-branch
 * breakdown; low-stock count; and branch-scope confinement.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { InventoryBalanceService } from "../src/inventory/inventory-balance.service";
import { InventoryReportsService } from "../src/inventory/reports/inventory-reports.service";
import type { BranchAccess } from "../src/platform/rbac/branch-access";

const SCHEMA_PATH = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");

describe("inventory valuation (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let balance: InventoryBalanceService;
  let reports: InventoryReportsService;

  const HQ: BranchAccess = { chainWide: true, branchIds: [] };
  const BRANCH = "val-branch";
  const OTHER = "val-other";
  const memberOther: BranchAccess = { chainWide: false, branchIds: [OTHER] };

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
    reports = new InventoryReportsService(prisma);

    for (const id of [BRANCH, OTHER]) {
      await prisma.branch.create({ data: { id, code: id.slice(-3).toUpperCase(), name: id, address: "x", phone: "0900000000" } });
    }
    const kg = await prisma.unit.create({ data: { code: "KG", name: "Kilogram" } });
    const meat = await prisma.ingredientGroup.create({ data: { name: "Thịt" } });
    const spice = await prisma.ingredientGroup.create({ data: { name: "Gia vị" } });
    const beef = await prisma.ingredient.create({
      data: { code: "NL001", name: "Ba chỉ bò", groupId: meat.id, unitId: kg.id, defaultMinStock: 50 },
    });
    const salt = await prisma.ingredient.create({
      data: { code: "NL002", name: "Muối", groupId: spice.id, unitId: kg.id, defaultMinStock: 5 },
    });

    // 65 kg beef @ 20000 = 1_300_000 ; 2 kg salt @ 1000 = 2000 (below min 5 → low).
    await prisma.withTx(async (tx) => {
      await balance.applyDelta(tx, { branchId: BRANCH, ingredientId: beef.id, type: "RECEIPT", qtyBase: 65, unitCostVnd: 20_000, createdBy: "seed" });
      await balance.applyDelta(tx, { branchId: BRANCH, ingredientId: salt.id, type: "RECEIPT", qtyBase: 2, unitCostVnd: 1_000, createdBy: "seed" });
    });
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("totals stock value with group + branch breakdown and low-stock count", async () => {
    const v = await reports.valuation({}, HQ);
    expect(v.totalValueVnd).toBe(1_302_000);
    expect(v.itemCount).toBe(2);
    expect(v.lowStockCount).toBe(1);

    const meat = v.byGroup.find((g) => g.group === "Thịt");
    expect(meat?.valueVnd).toBe(1_300_000);
    const branch = v.byBranch.find((b) => b.branchId === BRANCH);
    expect(branch?.valueVnd).toBe(1_302_000);
    expect(branch?.lowStockCount).toBe(1);
  });

  it("confines valuation to the caller's branch scope", async () => {
    const v = await reports.valuation({}, memberOther);
    expect(v.totalValueVnd).toBe(0);
    expect(v.itemCount).toBe(0);
  });
});
