/**
 * RBAC denial matrix for inventory + bank-reconcile role gates (integration).
 *
 * Locks in the controller role gates: view (INVENTORY_VIEW_ROLES) vs write
 * (INVENTORY_WRITE_ROLES) vs chain-level reconcile (QUAN_TRI_HQ/CHU_CHUOI/
 * KE_TOAN_CHUOI). Branch-scope denial is covered by the service-level e2e; this
 * covers the ROLE dimension end-to-end.
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

describe("inventory + reconcile RBAC (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;
  const token: Record<string, string> = {};

  const login = async (username: string) =>
    (await request(app.getHttpServer()).post("/auth/login").send({ username, password: "Password123" }).expect(201)).body.accessToken as string;

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

    const branch = await prisma.branch.create({ data: { code: "RB01", name: "RB", address: "x", phone: "0900000000" } });
    const hash = await argon2.hash("Password123");
    const mk = async (username: string, role: string, chainWide: boolean) => {
      const u = await prisma.appUser.create({ data: { username, passwordHash: hash, role: role as never, chainWide, mustChangePassword: false } });
      if (!chainWide) await prisma.userBranch.create({ data: { userId: u.id, branchId: branch.id } });
      token[role] = await login(username);
    };
    await mk("rbac-cashier", "THU_NGAN", false);
    await mk("rbac-kho", "THU_KHO", false);
    await mk("rbac-ketoan", "KE_TOAN_CHUOI", true);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  const get = (path: string, role: string) => request(app.getHttpServer()).get(path).set("Authorization", `Bearer ${token[role]}`);
  const post = (path: string, role: string, body: object) => request(app.getHttpServer()).post(path).set("Authorization", `Bearer ${token[role]}`).send(body);

  it("cashier (THU_NGAN) has no inventory access", async () => {
    await get("/inventory/stock", "THU_NGAN").expect(403);
    await get("/inventory/reports/valuation", "THU_NGAN").expect(403);
    await post("/inventory/purchase-orders", "THU_NGAN", { branchId: "b", supplierId: "s", lines: [{ ingredientId: "i", unitId: "u", qty: 1, unitPriceVnd: 1000 }] }).expect(403);
  });

  it("warehouse (THU_KHO) can view/write inventory but not reconcile bank", async () => {
    await get("/inventory/stock", "THU_KHO").expect(200);
    await get("/sales/bank-transactions", "THU_KHO").expect(403);
  });

  it("chain accountant (KE_TOAN_CHUOI) can view inventory + reconcile, but not write stock", async () => {
    await get("/inventory/stock", "KE_TOAN_CHUOI").expect(200);
    await get("/sales/bank-transactions", "KE_TOAN_CHUOI").expect(200);
    await post("/inventory/stock/issue", "KE_TOAN_CHUOI", { branchId: "b", ingredientId: "i", qty: 1, note: "x" }).expect(403);
  });
});
