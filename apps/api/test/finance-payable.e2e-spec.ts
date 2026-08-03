/**
 * Supplier payable (E3/F2) — real Postgres via testcontainer.
 *
 * Covers paying a payable partially then fully (OPEN → PAID), rejecting an
 * overpayment, and the payables list with outstanding/overdue. A finance EXPENSE
 * entry (linked to the supplier) is booked per payment. Approval isn't triggered
 * (threshold 0), so DiscountsService is a no-op stub.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { FinanceService } from "../src/sales/finance/finance.service";
import type { DiscountsService } from "../src/sales/discounts/discounts.service";
import type { BranchAccess } from "../src/platform/rbac/branch-access";

const SCHEMA = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");
const HQ: BranchAccess = { chainWide: true, branchIds: [] };
const stubDiscounts = { verifyApprovalPin: async () => ({ approved: true, approvedBy: "m" }) } as unknown as DiscountsService;

describe("supplier payable (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let finance: FinanceService;

  let branchId: string;
  let supplierId: string;
  let accountId: string;
  let payableId: string;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });

    prisma = new PrismaService();
    await prisma.$connect();
    finance = new FinanceService(prisma, new AuditService(prisma), stubDiscounts);

    branchId = (await prisma.branch.create({ data: { code: "PB", name: "PB", address: "x", phone: "0900000000" } })).id;
    supplierId = (await prisma.supplier.create({ data: { name: "NCC 1", debtTerms: 30 } })).id;
    const grp = await prisma.accountGroup.create({ data: { name: "Chi phí" } });
    accountId = (await prisma.account.create({ data: { groupId: grp.id, name: "Thanh toán NCC", flow: "EXPENSE", approvalThresholdVnd: 0 } })).id;
    // A payable due yesterday (overdue).
    const due = new Date(); due.setDate(due.getDate() - 1);
    payableId = (await prisma.supplierPayable.create({ data: { supplierId, branchId, amountVnd: 1_000_000, dueDate: due } })).id;
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("pays a payable partially (stays OPEN) and books a finance EXPENSE", async () => {
    const r = await finance.paySupplier(payableId, { accountId, amountVnd: 400_000, method: "CASH" }, "acc", "KE_TOAN_CHUOI", HQ);
    expect(r.paidVnd).toBe(400_000);
    expect(r.outstandingVnd).toBe(600_000);
    expect(r.status).toBe("OPEN");
    const entries = await prisma.financialTransaction.findMany({ where: { supplierId, flow: "EXPENSE" } });
    expect(entries).toHaveLength(1);
    expect(entries[0].amountVnd).toBe(400_000);
  });

  it("marks a payable PAID once fully settled", async () => {
    const r = await finance.paySupplier(payableId, { accountId, amountVnd: 600_000, method: "CASH" }, "acc", "KE_TOAN_CHUOI", HQ);
    expect(r.status).toBe("PAID");
    expect(r.outstandingVnd).toBe(0);
  });

  it("rejects a payment that exceeds the remaining balance", async () => {
    await expect(
      finance.paySupplier(payableId, { accountId, amountVnd: 1, method: "CASH" }, "acc", "KE_TOAN_CHUOI", HQ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists payables with outstanding + overdue flags", async () => {
    // Add a fresh OPEN payable to see outstanding.
    await prisma.supplierPayable.create({ data: { supplierId, branchId, amountVnd: 500_000 } });
    const res = await finance.listPayables({ branchId }, HQ);
    const paid = res.data.find((p) => p.id === payableId);
    expect(paid?.status).toBe("PAID");
    expect(paid?.overdue).toBe(false); // paid → not overdue
    const open = res.data.find((p) => p.outstandingVnd === 500_000);
    expect(open?.supplierName).toBe("NCC 1");
  });
});
