/**
 * Supplier-debt aging (E4/P2) — real Postgres via testcontainer.
 *
 * Covers bucketing OPEN payables by dueDate age (not-due / 1-30 / 31-60 / 60+),
 * per-supplier + grand totals; the due-soon list (≤7 days or overdue); branch-
 * scope confinement; and the xlsx export. DiscountsService is unused here.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { FinanceService } from "../src/sales/finance/finance.service";
import type { DiscountsService } from "../src/sales/discounts/discounts.service";
import type { BranchAccess } from "../src/platform/rbac/branch-access";

const SCHEMA = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");
const HQ: BranchAccess = { chainWide: true, branchIds: [] };
const stubDiscounts = { verifyApprovalPin: async () => ({ approved: true, approvedBy: "m" }) } as unknown as DiscountsService;

/** A date `days` in the past (negative = future), at midnight-ish. */
const daysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

describe("supplier-debt aging (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let finance: FinanceService;

  const A = "aging-a";
  const B = "aging-b";
  const memberB: BranchAccess = { chainWide: false, branchIds: [B] };
  let supA: string;
  let supB: string;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });

    prisma = new PrismaService();
    await prisma.$connect();
    finance = new FinanceService(prisma, new AuditService(prisma), stubDiscounts);

    for (const id of [A, B]) await prisma.branch.create({ data: { id, code: id.slice(-3).toUpperCase(), name: id, address: "x", phone: "0900000000" } });
    supA = (await prisma.supplier.create({ data: { name: "NCC A" } })).id;
    supB = (await prisma.supplier.create({ data: { name: "NCC B" } })).id;

    // Branch A / supplier A: one in each bucket.
    await prisma.supplierPayable.create({ data: { supplierId: supA, branchId: A, amountVnd: 100_000, dueDate: daysAgo(-3) } }); // due in 3d → not-due (but due-soon)
    await prisma.supplierPayable.create({ data: { supplierId: supA, branchId: A, amountVnd: 200_000, dueDate: daysAgo(15) } }); // 1-30
    await prisma.supplierPayable.create({ data: { supplierId: supA, branchId: A, amountVnd: 300_000, dueDate: daysAgo(45) } }); // 31-60
    await prisma.supplierPayable.create({ data: { supplierId: supA, branchId: A, amountVnd: 400_000, dueDate: daysAgo(90) } }); // 60+
    // A payable with no dueDate → not-due; and a PAID one → excluded.
    await prisma.supplierPayable.create({ data: { supplierId: supA, branchId: A, amountVnd: 50_000 } });
    await prisma.supplierPayable.create({ data: { supplierId: supA, branchId: A, amountVnd: 999_000, paidVnd: 999_000, status: "PAID", dueDate: daysAgo(120) } });

    // Branch B / supplier B: one overdue payable.
    await prisma.supplierPayable.create({ data: { supplierId: supB, branchId: B, amountVnd: 700_000, dueDate: daysAgo(10) } }); // 1-30
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("buckets outstanding by dueDate age with per-supplier + grand totals", async () => {
    const r = await finance.payableAging({}, HQ);
    const a = r.suppliers.find((s) => s.supplierId === supA)!;
    expect(a.notDueVnd).toBe(150_000); // 100k due-in-3d + 50k no-date
    expect(a.d1_30Vnd).toBe(200_000);
    expect(a.d31_60Vnd).toBe(300_000);
    expect(a.d60plusVnd).toBe(400_000);
    expect(a.totalOutstandingVnd).toBe(1_050_000);
    // Grand totals include supplier B's 700k in the 1-30 bucket; PAID excluded.
    expect(r.totals.d1_30Vnd).toBe(900_000);
    expect(r.totals.totalOutstandingVnd).toBe(1_750_000);
    expect(r.totals.supplierCount).toBe(2);
  });

  it("lists due-soon (≤7 days or overdue), soonest first", async () => {
    const r = await finance.dueSoon({}, HQ);
    // not-due-in-3d + the three overdue (15/45/90d) + B's 10d = 5; the no-date one excluded.
    expect(r.total).toBe(5);
    const oldest = r.items[0];
    expect(oldest.daysOverdue).toBe(90); // most overdue sorts first (earliest dueDate)
  });

  it("confines to the caller's branch scope", async () => {
    const r = await finance.payableAging({}, memberB);
    expect(r.totals.supplierCount).toBe(1);
    expect(r.suppliers[0].supplierId).toBe(supB);
    expect(r.totals.totalOutstandingVnd).toBe(700_000);
  });

  it("exports an .xlsx buffer", async () => {
    const buf = await finance.exportPayableAging({}, HQ);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});
