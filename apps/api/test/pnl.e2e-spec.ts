/**
 * P&L report integration tests — real Postgres via testcontainer.
 *
 * P&L = net revenue − COGS − operating expenses. Reuses the gross-margin engine
 * for revenue/COGS; opex is the sum of EXPENSE financial transactions in the
 * period, EXCLUDING supplier-linked entries (those settle payables for received
 * goods already counted as COGS). Covers the totals, the supplier-exclusion, and
 * branch-scope confinement.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { ReportsService } from "../src/sales/reports/reports.service";
import type { BranchAccess } from "../src/platform/rbac/branch-access";

const SCHEMA = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");
const DAY = "2026-08-01";

describe("pnl (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let reports: ReportsService;

  const HQ: BranchAccess = { chainWide: true, branchIds: [] };
  const A = "pnl-a";
  const B = "pnl-b";
  const memberB: BranchAccess = { chainWide: false, branchIds: [B] };
  let beefId: string;
  let opexAccountId: string;
  let seq = 0;
  let txSeq = 0;

  const seedBill = async (branchId: string, shiftId: string, total: number, status: "COMPLETED" | "CANCELLED") => {
    seq += 1;
    return prisma.bill.create({
      data: {
        number: `PNL-${seq}`,
        seq,
        branchId,
        shiftId,
        deviceId: "dev",
        businessDate: new Date(`${DAY}T00:00:00Z`),
        status,
        createdBy: "seed",
        totalVnd: total,
        guestCount: 1,
      },
    });
  };

  const consume = (branchId: string, billId: string, qtyBase: number) =>
    prisma.stockMovement.create({
      data: { branchId, ingredientId: beefId, type: "ISSUE", qtyBase, unitCostVnd: 20_000, refType: "BILL", refId: billId, createdBy: "seed" },
    });

  const expense = (branchId: string, amountVnd: number, supplierId?: string) => {
    txSeq += 1;
    return prisma.financialTransaction.create({
      data: {
        code: `TC-${txSeq}`,
        branchId,
        accountId: opexAccountId,
        flow: "EXPENSE",
        amountVnd,
        method: "CASH",
        occurredAt: new Date(`${DAY}T08:00:00Z`),
        createdBy: "seed",
        ...(supplierId ? { supplierId } : {}),
      },
    });
  };

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });

    prisma = new PrismaService();
    await prisma.$connect();
    reports = new ReportsService(prisma, new AuditService(prisma));

    for (const id of [A, B]) {
      await prisma.branch.create({ data: { id, code: id.slice(-3).toUpperCase(), name: id, address: "x", phone: "0900000000" } });
    }
    const kg = await prisma.unit.create({ data: { code: "KG", name: "Kilogram" } });
    const group = await prisma.ingredientGroup.create({ data: { name: "Chung" } });
    beefId = (await prisma.ingredient.create({ data: { code: "NL001", name: "Bò", groupId: group.id, unitId: kg.id } })).id;
    const acctGroup = await prisma.accountGroup.create({ data: { name: "Chi phí" } });
    opexAccountId = (await prisma.account.create({ data: { groupId: acctGroup.id, name: "Chi phí vận hành", flow: "EXPENSE" } })).id;
    const supplier = await prisma.supplier.create({ data: { name: "NCC" } });

    const mkShift = (branchId: string) =>
      prisma.shift.create({ data: { branchId, deviceId: "dev", businessDate: new Date(`${DAY}T00:00:00Z`), status: "CLOSED", openedBy: "seed", openingCashVnd: 0 } });
    const shiftA = await mkShift(A);
    const shiftB = await mkShift(B);

    // Branch A: net 350k, COGS 70k. Opex 50k (rent) + a 999k supplier payment (excluded).
    const a1 = await seedBill(A, shiftA.id, 200_000, "COMPLETED");
    await prisma.refund.create({ data: { billId: a1.id, amountVnd: 50_000, method: "CASH", reason: "t", refundedBy: "s", approvedBy: "s" } });
    await consume(A, a1.id, -2); // 40k
    const a2 = await seedBill(A, shiftA.id, 200_000, "COMPLETED");
    await consume(A, a2.id, -1.5); // 30k
    await expense(A, 50_000); // operating expense → counted
    await expense(A, 999_000, supplier.id); // supplier payment → excluded

    // Branch B: net 300k, COGS 60k. Opex 20k.
    const b1 = await seedBill(B, shiftB.id, 300_000, "COMPLETED");
    await consume(B, b1.id, -3); // 60k
    await expense(B, 20_000);
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("computes P&L by day; supplier payments excluded from opex", async () => {
    const r = await reports.pnl({ from: DAY, to: DAY, groupBy: "day" }, HQ);
    // net = 350k + 300k = 650k ; COGS = 70k + 60k = 130k ; gross = 520k.
    // opex = 50k + 20k = 70k (999k supplier payment excluded) ; net profit = 450k.
    expect(r.totals.netRevenueVnd).toBe(650_000);
    expect(r.totals.cogsVnd).toBe(130_000);
    expect(r.totals.grossProfitVnd).toBe(520_000);
    expect(r.totals.opexVnd).toBe(70_000);
    expect(r.totals.netProfitVnd).toBe(450_000);
    expect(r.rows).toHaveLength(1);
  });

  it("groups by branch", async () => {
    const r = await reports.pnl({ from: DAY, to: DAY, groupBy: "branch" }, HQ);
    const a = r.rows.find((row) => row.key === A)!;
    const b = r.rows.find((row) => row.key === B)!;
    expect(a.grossProfitVnd).toBe(280_000);
    expect(a.opexVnd).toBe(50_000);
    expect(a.netProfitVnd).toBe(230_000);
    expect(b.opexVnd).toBe(20_000);
    expect(b.netProfitVnd).toBe(220_000);
  });

  it("confines to the caller's branch scope", async () => {
    const r = await reports.pnl({ from: DAY, to: DAY, groupBy: "branch" }, memberB);
    expect(r.rows.every((row) => row.key === B)).toBe(true);
    expect(r.totals.netProfitVnd).toBe(220_000);
  });

  it("exports an .xlsx buffer", async () => {
    const buf = await reports.exportPnl({ from: DAY, to: DAY, groupBy: "day" }, HQ);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});
