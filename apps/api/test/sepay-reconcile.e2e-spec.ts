/**
 * Sepay auto-reconcile (V1) — real Postgres via testcontainer + HTTP webhook.
 *
 * Proves: a unique amount+number match auto-pays the bill (VIETQR payment +
 * paidAt + MATCHED); amount mismatch, ambiguity, and already-paid bills stay
 * UNMATCHED; replay doesn't double-pay; manual match/ignore work.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { BadRequestException, ConflictException, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { BankReconcileService } from "../src/sales/bank-reconcile/bank-reconcile.service";
import type { BranchAccess } from "../src/platform/rbac/branch-access";

const SCHEMA = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");
const API_KEY = "sepay-test-key";
const HQ: BranchAccess = { chainWide: true, branchIds: [] };

describe("Sepay auto-reconcile (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;
  let service: BankReconcileService;

  let branchId: string;
  let shiftId: string;
  let txId = 2000;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "s";
    process.env.JWT_REFRESH_SECRET = "r";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.SEPAY_API_KEY = API_KEY;
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    service = app.get(BankReconcileService);

    const branch = await prisma.branch.create({ data: { code: "CN01", name: "CN01", address: "x", phone: "0900000000" } });
    branchId = branch.id;
    shiftId = (await prisma.shift.create({ data: { branchId, deviceId: "dev", businessDate: new Date("2026-08-03T00:00:00Z"), status: "OPEN", openedBy: "seed", openingCashVnd: 0 } })).id;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  let seq = 0;
  const makeBill = (number: string, totalVnd: number, paid = false) => {
    seq += 1;
    return prisma.bill.create({
      data: {
        number,
        seq,
        branchId,
        shiftId,
        deviceId: "dev",
        businessDate: new Date("2026-08-03T00:00:00Z"),
        status: "COMPLETED",
        createdBy: "seed",
        totalVnd,
        guestCount: 1,
        paidAt: paid ? new Date() : null,
      },
    });
  };

  const webhook = (content: string, transferAmount: number) => {
    txId += 1;
    return request(app.getHttpServer())
      .post("/webhooks/sepay")
      .set("Authorization", `Apikey ${API_KEY}`)
      .send({ id: txId, content, transferType: "in", transferAmount, transactionDate: "2026-08-03 10:00:00", referenceCode: `REF${txId}` })
      .expect(200)
      .then(() => String(txId));
  };

  const billById = (id: string) => prisma.bill.findUnique({ where: { id }, include: { payments: true } });
  const txByProviderId = (pid: string) => prisma.bankTransaction.findUnique({ where: { provider_providerTxId: { provider: "sepay", providerTxId: pid } } });

  it("auto-pays a bill on a unique amount + number match", async () => {
    const bill = await makeBill("CN01-260803-0001", 200_000);
    const pid = await webhook("Thanh toan CN01 260803 0001", 200_000);

    const paid = await billById(bill.id);
    expect(paid?.paidAt).toBeTruthy();
    expect(paid?.payments).toHaveLength(1);
    expect(paid?.payments[0].method).toBe("VIETQR");
    expect(paid?.payments[0].amountVnd).toBe(200_000);

    const tx = await txByProviderId(pid);
    expect(tx?.status).toBe("MATCHED");
    expect(tx?.matchedBillId).toBe(bill.id);
  });

  it("leaves a transfer unmatched when the amount doesn't equal any bill total", async () => {
    const bill = await makeBill("CN01-260803-0002", 200_000);
    const pid = await webhook("CN01 260803 0002", 999_000);
    expect((await billById(bill.id))?.paidAt).toBeNull();
    expect((await txByProviderId(pid))?.status).toBe("UNMATCHED");
  });

  it("leaves ambiguous matches (two bills, both numbers in memo) unmatched", async () => {
    await makeBill("CN01-260803-0003", 150_000);
    await makeBill("CN01-260803-0004", 150_000);
    const pid = await webhook("CN01 260803 0003 va CN01 260803 0004", 150_000);
    expect((await txByProviderId(pid))?.status).toBe("UNMATCHED");
  });

  it("does not match an already-paid bill", async () => {
    const bill = await makeBill("CN01-260803-0005", 175_000, true);
    const pid = await webhook("CN01 260803 0005", 175_000);
    expect((await txByProviderId(pid))?.status).toBe("UNMATCHED");
    // The pre-existing paidAt is unchanged and no VIETQR payment was added.
    expect((await billById(bill.id))?.payments).toHaveLength(0);
  });

  it("is idempotent — a replayed matched webhook doesn't double-pay", async () => {
    const bill = await makeBill("CN01-260803-0006", 210_000);
    txId += 1;
    const body = { id: txId, content: "CN01 260803 0006", transferType: "in", transferAmount: 210_000, transactionDate: "2026-08-03 11:00:00" };
    await request(app.getHttpServer()).post("/webhooks/sepay").set("Authorization", `Apikey ${API_KEY}`).send(body).expect(200);
    await request(app.getHttpServer()).post("/webhooks/sepay").set("Authorization", `Apikey ${API_KEY}`).send(body).expect(200);
    expect((await billById(bill.id))?.payments).toHaveLength(1);
  });

  it("supports manual match and rejects an amount mismatch / paid bill", async () => {
    const bill = await makeBill("CN01-260803-0007", 88_000);
    const pid = await webhook("khong ro noi dung", 88_000); // unmatched (no number)
    const tx = await txByProviderId(pid);
    expect(tx?.status).toBe("UNMATCHED");

    // Amount mismatch → rejected.
    const other = await makeBill("CN01-260803-0008", 90_000);
    await expect(service.matchToBill(tx!.id, other.id, "mgr", HQ)).rejects.toBeInstanceOf(BadRequestException);

    // Correct manual match pays the bill.
    const result = await service.matchToBill(tx!.id, bill.id, "mgr", HQ);
    expect(result?.status).toBe("MATCHED");
    expect((await billById(bill.id))?.paidAt).toBeTruthy();

    // Re-matching an already-matched tx → conflict.
    await expect(service.matchToBill(tx!.id, bill.id, "mgr", HQ)).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not confirm two bills from one transfer under concurrent manual match (C1)", async () => {
    // One unmatched transfer, two unpaid bills at the same total.
    const a = await makeBill("CN01-260803-0100", 130_000);
    const b = await makeBill("CN01-260803-0101", 130_000);
    const pid = await webhook("khong ro", 130_000);
    const tx = await txByProviderId(pid);

    // Fire both matches concurrently; the FOR UPDATE lock must let only one win.
    const results = await Promise.allSettled([
      service.matchToBill(tx!.id, a.id, "m1", HQ),
      service.matchToBill(tx!.id, b.id, "m2", HQ),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    expect(fulfilled).toBe(1);

    // Exactly one bill is paid; the transfer is MATCHED to exactly that one.
    const paidCount = [await billById(a.id), await billById(b.id)].filter((x) => x?.paidAt).length;
    expect(paidCount).toBe(1);
    const finalTx = await txByProviderId(pid);
    expect(finalTx?.status).toBe("MATCHED");
    const payments = (await billById(a.id))!.payments.length + (await billById(b.id))!.payments.length;
    expect(payments).toBe(1);
  });

  it("ignores a transfer", async () => {
    const pid = await webhook("tien chuyen nham", 12_000);
    const tx = await txByProviderId(pid);
    const updated = await service.ignore(tx!.id, "không phải thanh toán", "mgr");
    expect(updated?.status).toBe("IGNORED");
    expect(updated?.note).toBe("không phải thanh toán");
  });
});
