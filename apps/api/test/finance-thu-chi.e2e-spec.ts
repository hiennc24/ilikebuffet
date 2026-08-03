/**
 * Finance thu-chi (E3/F0) — real Postgres via testcontainer + HTTP.
 *
 * Proves capability gating (cash:create-voucher / cash:read via the permission
 * matrix), the over-threshold manager-PIN approval, flow snapshot, branch-scope,
 * and list totals.
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

const SCHEMA = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");
const PIN = "123456";

describe("finance thu-chi (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;

  let branchAId: string;
  let branchBId: string;
  let expenseAccId: string; // threshold 1,000,000
  let incomeAccId: string; // no threshold
  let managerId: string;
  const token: Record<string, string> = {};

  const login = async (u: string) => (await request(app.getHttpServer()).post("/auth/login").send({ username: u, password: "Password123" }).expect(201)).body.accessToken as string;
  const post = (role: string, body: object) => request(app.getHttpServer()).post("/sales/finance").set("Authorization", `Bearer ${token[role]}`).send(body);

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "s";
    process.env.JWT_REFRESH_SECRET = "r";
    process.env.REDIS_URL = "redis://localhost:6379";
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    branchAId = (await prisma.branch.create({ data: { code: "FA", name: "FA", address: "x", phone: "0900000000" } })).id;
    branchBId = (await prisma.branch.create({ data: { code: "FB", name: "FB", address: "x", phone: "0900000001" } })).id;
    const grp = await prisma.accountGroup.create({ data: { name: "Chi phí" } });
    expenseAccId = (await prisma.account.create({ data: { groupId: grp.id, name: "Điện nước", flow: "EXPENSE", approvalThresholdVnd: 1_000_000 } })).id;
    incomeAccId = (await prisma.account.create({ data: { groupId: grp.id, name: "Thu khác", flow: "INCOME", approvalThresholdVnd: 0 } })).id;

    const hash = await argon2.hash("Password123");
    const mk = async (username: string, role: string, chainWide: boolean, pinHash?: string) => {
      const u = await prisma.appUser.create({ data: { username, passwordHash: hash, role: role as never, chainWide, mustChangePassword: false, ...(pinHash ? { approvalPinHash: pinHash } : {}) } });
      if (!chainWide) await prisma.userBranch.create({ data: { userId: u.id, branchId: branchAId } });
      token[role] = await login(username);
      return u.id;
    };
    await mk("fin-ketoan", "KE_TOAN_CHUOI", true);
    managerId = await mk("fin-mgr", "QUAN_LY_CN", false, await argon2.hash(PIN));
    await mk("fin-cashier", "THU_NGAN", false);
    await mk("fin-kho", "THU_KHO", false);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it("accountant records an expense within threshold (no PIN, flow snapshot)", async () => {
    const res = await post("KE_TOAN_CHUOI", { branchId: branchAId, accountId: expenseAccId, amountVnd: 500_000, method: "CASH" }).expect(201);
    expect(res.body.flow).toBe("EXPENSE");
    expect(res.body.approvedBy).toBeNull();
    expect(res.body.code).toMatch(/^TC-FA-/);
  });

  it("blocks an over-threshold entry without a manager PIN", async () => {
    await post("KE_TOAN_CHUOI", { branchId: branchAId, accountId: expenseAccId, amountVnd: 2_000_000, method: "CASH" }).expect(403);
  });

  it("allows an over-threshold entry with a valid manager PIN", async () => {
    const res = await post("KE_TOAN_CHUOI", { branchId: branchAId, accountId: expenseAccId, amountVnd: 2_000_000, method: "CASH", managerId, pin: PIN }).expect(201);
    expect(res.body.approvedBy).toBe(managerId);
  });

  it("denies create to a role without cash:create-voucher (warehouse)", async () => {
    await post("THU_KHO", { branchId: branchAId, accountId: incomeAccId, amountVnd: 1000, method: "CASH" }).expect(403);
  });

  it("denies list to a role without cash:read (cashier), allows the accountant with totals", async () => {
    await request(app.getHttpServer()).get("/sales/finance").set("Authorization", `Bearer ${token.THU_NGAN}`).expect(403);
    const res = await request(app.getHttpServer()).get("/sales/finance").set("Authorization", `Bearer ${token.KE_TOAN_CHUOI}`).expect(200);
    // 500k + 2M expense so far.
    expect(res.body.totals.expenseVnd).toBe(2_500_000);
    expect(res.body.totals.netVnd).toBe(-2_500_000);
  });

  it("denies creating an entry outside the caller's branch scope", async () => {
    // Manager belongs to branch A only; entry for branch B → 403.
    await post("QUAN_LY_CN", { branchId: branchBId, accountId: incomeAccId, amountVnd: 1000, method: "CASH" }).expect(403);
  });

  it("summarises thu-chi grouped by account with totals", async () => {
    await post("KE_TOAN_CHUOI", { branchId: branchAId, accountId: incomeAccId, amountVnd: 300_000, method: "CASH" }).expect(201);
    const res = await request(app.getHttpServer()).get("/sales/finance/summary").set("Authorization", `Bearer ${token.KE_TOAN_CHUOI}`).expect(200);
    const expenseRow = (res.body.rows as Array<{ accountId: string; flow: string; amountVnd: number }>).find((r) => r.accountId === expenseAccId);
    expect(expenseRow?.amountVnd).toBe(2_500_000); // 500k + 2M
    expect(res.body.totals.incomeVnd).toBe(300_000);
    expect(res.body.totals.expenseVnd).toBe(2_500_000);
    expect(res.body.totals.netVnd).toBe(-2_200_000);
  });
});
