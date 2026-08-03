/**
 * Gross-margin report integration tests — real Postgres via testcontainer.
 *
 * Covers: net revenue − estimated COGS by day and by branch; a bill cancelled
 * in-window nets to zero on both sides; COGS is attributed to the bill's
 * businessDate even when the movement's createdAt is a later day (offline sync);
 * and branch-scope confinement.
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

describe("gross margin (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let reports: ReportsService;

  const HQ: BranchAccess = { chainWide: true, branchIds: [] };
  const A = "gm-a";
  const B = "gm-b";
  const memberB: BranchAccess = { chainWide: false, branchIds: [B] };
  let beefId: string;
  let seq = 0;

  const seedBill = async (branchId: string, shiftId: string, total: number, status: "COMPLETED" | "CANCELLED") => {
    seq += 1;
    return prisma.bill.create({
      data: {
        number: `GM-${seq}`,
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

  const consume = (branchId: string, billId: string, qtyBase: number, refType: "BILL" | "BILL_REVERSAL", createdAt?: Date) =>
    prisma.stockMovement.create({
      data: {
        branchId,
        ingredientId: beefId,
        type: qtyBase < 0 ? "ISSUE" : "RECEIPT",
        qtyBase,
        unitCostVnd: 20_000,
        refType,
        refId: billId,
        createdBy: "seed",
        ...(createdAt ? { createdAt } : {}),
      },
    });

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

    const mkShift = (branchId: string) =>
      prisma.shift.create({ data: { branchId, deviceId: "dev", businessDate: new Date(`${DAY}T00:00:00Z`), status: "CLOSED", openedBy: "seed", openingCashVnd: 0 } });
    const shiftA = await mkShift(A);
    const shiftB = await mkShift(B);

    // Branch A: a1 net 150k (200k − 50k refund), a2 net 200k, a3 CANCELLED (net 0).
    const a1 = await seedBill(A, shiftA.id, 200_000, "COMPLETED");
    await prisma.refund.create({ data: { billId: a1.id, amountVnd: 50_000, method: "CASH", reason: "t", refundedBy: "s", approvedBy: "s" } });
    await consume(A, a1.id, -2, "BILL"); // 40k COGS
    const a2 = await seedBill(A, shiftA.id, 200_000, "COMPLETED");
    await consume(A, a2.id, -1.5, "BILL"); // 30k COGS
    const a3 = await seedBill(A, shiftA.id, 200_000, "CANCELLED");
    await consume(A, a3.id, -1, "BILL");
    await consume(A, a3.id, 1, "BILL_REVERSAL"); // nets to 0

    // Branch B: b1 net 300k; its COGS movement is stamped 10 days later (offline sync).
    const b1 = await seedBill(B, shiftB.id, 300_000, "COMPLETED");
    await consume(B, b1.id, -3, "BILL", new Date("2026-08-11T00:00:00Z")); // 60k COGS, late createdAt
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("computes gross margin by day (net revenue − COGS), cancelled nets to zero", async () => {
    const r = await reports.grossMargin({ from: DAY, to: DAY, groupBy: "day" }, HQ);
    // net = 150k + 200k + 0 + 300k = 650k ; COGS = 40k + 30k + 0 + 60k = 130k.
    expect(r.totals.netRevenueVnd).toBe(650_000);
    expect(r.totals.cogsVnd).toBe(130_000);
    expect(r.totals.grossProfitVnd).toBe(520_000);
    expect(r.totals.marginPct).toBeCloseTo(80, 1);
    expect(r.rows).toHaveLength(1); // all one day
  });

  it("groups by branch", async () => {
    const r = await reports.grossMargin({ from: DAY, to: DAY, groupBy: "branch" }, HQ);
    const a = r.rows.find((row) => row.key === A)!;
    const b = r.rows.find((row) => row.key === B)!;
    expect(a.netRevenueVnd).toBe(350_000);
    expect(a.cogsVnd).toBe(70_000);
    expect(a.grossProfitVnd).toBe(280_000);
    // Branch B COGS counted despite its movement's later createdAt (businessDate-aligned).
    expect(b.netRevenueVnd).toBe(300_000);
    expect(b.cogsVnd).toBe(60_000);
  });

  it("confines to the caller's branch scope", async () => {
    const r = await reports.grossMargin({ from: DAY, to: DAY, groupBy: "branch" }, memberB);
    expect(r.rows.every((row) => row.key === B)).toBe(true);
    expect(r.totals.netRevenueVnd).toBe(300_000);
    expect(r.totals.cogsVnd).toBe(60_000);
  });

  it("exports an .xlsx buffer", async () => {
    const buf = await reports.exportGrossMargin({ from: DAY, to: DAY, groupBy: "branch" }, HQ);
    expect(buf.length).toBeGreaterThan(0);
    // xlsx is a zip — first bytes are "PK".
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});
