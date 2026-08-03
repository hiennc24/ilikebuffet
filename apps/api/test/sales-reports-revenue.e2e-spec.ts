/**
 * E2E: revenue report.
 *
 * Proves: net = Σ(COMPLETED.total) − Σ(refunds), CANCELLED excluded from money;
 * groupBy=branch; branch-scoping (manager sees only their branch); role gate
 * (cashier 403). Real Postgres testcontainer (Docker up required).
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as argon2 from "argon2";
import request from "supertest";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCHEMA = join(REPO_ROOT, "prisma", "schema.prisma");
const DAY = "2026-08-01";

describe("Revenue report (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;

  let branchAId: string;
  let branchBId: string;
  let hqToken: string;
  let managerAToken: string;
  let cashierToken: string;

  const login = (u: string, p: string) => request(app.getHttpServer()).post("/auth/login").send({ username: u, password: p });

  async function seedBill(branchId: string, shiftId: string, seq: number, total: number, guests: number, status: "COMPLETED" | "CANCELLED", ttId: string) {
    return prisma.bill.create({
      data: {
        number: `R-${branchId.slice(-4)}-${seq}`,
        seq,
        branchId,
        shiftId,
        deviceId: "dev-x",
        businessDate: new Date(`${DAY}T00:00:00Z`),
        status,
        createdBy: "seed",
        totalVnd: total,
        guestCount: guests,
        lines: { create: [{ ticketTypeId: ttId, ticketTypeName: "Người lớn", unitPriceVnd: total, qty: 1, lineTotalVnd: total, isFree: false }] },
      },
    });
  }

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "test-secret-rev";
    process.env.JWT_REFRESH_SECRET = "test-refresh-rev";
    process.env.REDIS_URL = "redis://localhost:6379";

    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const [a, b] = await Promise.all([
      prisma.branch.create({ data: { code: "RV01", name: "Rev A", address: "a", phone: "0900000001" } }),
      prisma.branch.create({ data: { code: "RV02", name: "Rev B", address: "b", phone: "0900000002" } }),
    ]);
    branchAId = a.id;
    branchBId = b.id;

    await prisma.appUser.create({ data: { username: "hq-rev", passwordHash: await argon2.hash("Password123"), role: "QUAN_TRI_HQ", chainWide: true, mustChangePassword: false } });
    const mgr = await prisma.appUser.create({ data: { username: "mgr-rev", passwordHash: await argon2.hash("Password123"), role: "QUAN_LY_CN", chainWide: false, mustChangePassword: false } });
    await prisma.userBranch.create({ data: { userId: mgr.id, branchId: branchAId } });
    const cashier = await prisma.appUser.create({ data: { username: "cashier-rev", passwordHash: await argon2.hash("Password123"), role: "THU_NGAN", chainWide: false, mustChangePassword: false } });
    await prisma.userBranch.create({ data: { userId: cashier.id, branchId: branchAId } });

    const tt = await prisma.ticketType.create({ data: { name: "Người lớn", isFree: false, displayOrder: 0 } });
    const shiftA = await prisma.shift.create({ data: { branchId: branchAId, deviceId: "dev-x", businessDate: new Date(`${DAY}T00:00:00Z`), status: "CLOSED", openedBy: "seed", openingCashVnd: 0, expectedCashVnd: 400_000, countedCashVnd: 390_000, varianceVnd: -10_000, varianceNote: "thiếu" } });
    const shiftB = await prisma.shift.create({ data: { branchId: branchBId, deviceId: "dev-y", businessDate: new Date(`${DAY}T00:00:00Z`), status: "CLOSED", openedBy: "seed", openingCashVnd: 0, expectedCashVnd: 300_000, countedCashVnd: 300_000, varianceVnd: 0 } });

    // Branch A: 2 completed (200k each), 1 cancelled, 1 refund of 50k on the first.
    const b1 = await seedBill(branchAId, shiftA.id, 1, 200_000, 2, "COMPLETED", tt.id);
    await prisma.payment.create({ data: { billId: b1.id, method: "CASH", amountVnd: 200_000 } });
    await seedBill(branchAId, shiftA.id, 2, 200_000, 2, "COMPLETED", tt.id);
    await seedBill(branchAId, shiftA.id, 3, 200_000, 2, "CANCELLED", tt.id);
    await prisma.refund.create({ data: { billId: b1.id, amountVnd: 50_000, method: "CASH", reason: "test", refundedBy: "seed", approvedBy: "seed" } });
    // Branch B: 1 completed (300k).
    await seedBill(branchBId, shiftB.id, 1, 300_000, 3, "COMPLETED", tt.id);

    hqToken = (await login("hq-rev", "Password123")).body.accessToken;
    managerAToken = (await login("mgr-rev", "Password123")).body.accessToken;
    cashierToken = (await login("cashier-rev", "Password123")).body.accessToken;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it("HQ: net = gross − refunds, CANCELLED excluded from money", async () => {
    const res = await request(app.getHttpServer()).get(`/sales/reports/revenue?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${hqToken}`).expect(200);
    const t = res.body.totals;
    expect(t.grossVnd).toBe(700_000); // 200 + 200 + 300
    expect(t.refundedVnd).toBe(50_000);
    expect(t.netVnd).toBe(650_000);
    expect(t.billCount).toBe(3);
    expect(t.cancelledCount).toBe(1);
  });

  it("groupBy=branch splits net per branch", async () => {
    const res = await request(app.getHttpServer()).get(`/sales/reports/revenue?from=${DAY}&to=${DAY}&groupBy=branch`).set("Authorization", `Bearer ${hqToken}`).expect(200);
    const rows = res.body.rows as { key: string; netVnd: number }[];
    expect(rows.find((r) => r.key === branchAId)!.netVnd).toBe(350_000); // 400 − 50
    expect(rows.find((r) => r.key === branchBId)!.netVnd).toBe(300_000);
  });

  it("a branch manager sees only their branch", async () => {
    const res = await request(app.getHttpServer()).get(`/sales/reports/revenue?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${managerAToken}`).expect(200);
    expect(res.body.totals.netVnd).toBe(350_000); // branch A only
  });

  it("a cashier is forbidden", async () => {
    await request(app.getHttpServer()).get(`/sales/reports/revenue?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${cashierToken}`).expect(403);
  });

  it("exports the revenue report as an xlsx attachment (role-gated)", async () => {
    const res = await request(app.getHttpServer()).get(`/sales/reports/revenue/export?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${hqToken}`).expect(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(res.headers["content-disposition"]).toContain(".xlsx");
    await request(app.getHttpServer()).get(`/sales/reports/revenue/export?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${cashierToken}`).expect(403);
  });

  // ─── shift-cash ──────────────────────────────────────────────────────────────

  it("shift-cash: variance + system cash per CLOSED shift", async () => {
    const res = await request(app.getHttpServer()).get(`/sales/reports/shift-cash?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${hqToken}`).expect(200);
    const rows = res.body.rows as { branchId: string; varianceVnd: number; cashRevenueVnd: number }[];
    const a = rows.find((r) => r.branchId === branchAId)!;
    expect(a.varianceVnd).toBe(-10_000);
    expect(a.cashRevenueVnd).toBe(200_000); // the one CASH payment
    expect(res.body.totals.shortCount).toBe(1);
    expect(res.body.totals.shiftCount).toBe(2);
  });

  it("shift-cash: a branch manager sees only their branch", async () => {
    const res = await request(app.getHttpServer()).get(`/sales/reports/shift-cash?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${managerAToken}`).expect(200);
    const rows = res.body.rows as { branchId: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0].branchId).toBe(branchAId);
  });

  it("shift-cash: cashier forbidden", async () => {
    await request(app.getHttpServer()).get(`/sales/reports/shift-cash?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${cashierToken}`).expect(403);
  });

  it("shift-cash: exports an xlsx attachment (role-gated)", async () => {
    const res = await request(app.getHttpServer()).get(`/sales/reports/shift-cash/export?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${hqToken}`).expect(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(res.headers["content-disposition"]).toContain(".xlsx");
    await request(app.getHttpServer()).get(`/sales/reports/shift-cash/export?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${cashierToken}`).expect(403);
  });

  // ─── chain-overview (M10 X0) ─────────────────────────────────────────────────

  it("chain-overview: per-branch net + ranking + chain totals", async () => {
    const res = await request(app.getHttpServer()).get(`/sales/reports/chain-overview?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${hqToken}`).expect(200);
    // Branch A net = 150k (200−50 refund) + 200k = 350k, 2 bills; Branch B = 300k, 1 bill.
    expect(res.body.totals.netRevenueVnd).toBe(650_000);
    expect(res.body.totals.billCount).toBe(3);
    expect(res.body.totals.branchCount).toBe(2);
    const rows = res.body.rows as Array<{ branchId: string; netRevenueVnd: number; rank: number; cashVarianceVnd: number }>;
    expect(rows[0].rank).toBe(1);
    expect(rows[0].branchId).toBe(branchAId); // 350k ranks above 300k
    expect(rows[0].netRevenueVnd).toBe(350_000);
    expect(rows.find((r) => r.branchId === branchAId)?.cashVarianceVnd).toBe(-10_000);
  });

  it("chain-overview: branch manager and cashier are forbidden (chain-level only)", async () => {
    await request(app.getHttpServer()).get(`/sales/reports/chain-overview?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${managerAToken}`).expect(403);
    await request(app.getHttpServer()).get(`/sales/reports/chain-overview?from=${DAY}&to=${DAY}`).set("Authorization", `Bearer ${cashierToken}`).expect(403);
  });
});
