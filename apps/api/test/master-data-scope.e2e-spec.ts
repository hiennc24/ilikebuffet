/**
 * E2E: Master-data branch-scope enforcement.
 *
 * Proves the fail-closed contract for real scoped data:
 *
 *  1. THU_NGAN / QUAN_LY_CN of CN01 calls GET /master-data/suppliers:
 *     → sees chain-wide suppliers + CN01-specific suppliers only.
 *     → NEVER sees CN02-specific suppliers.
 *
 *  2. Chain-wide user (QUAN_TRI_HQ) calls GET /master-data/suppliers:
 *     → sees ALL suppliers (chain-wide + all branch-specific).
 *
 *  3. QUAN_LY_CN of CN01 creates a BRANCH_SPECIFIC supplier for CN01:
 *     → supplier is PENDING_HQ.
 *     → supplier is visible to CN01 users but NOT to CN02 users.
 *
 *  4. QUAN_LY_CN of CN01 attempting to create BRANCH_SPECIFIC supplier for CN02:
 *     → 403 Forbidden.
 *
 * Uses a real Postgres testcontainer + full NestJS app (via AppModule).
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
import { AuthService } from "../src/auth/auth.service";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCHEMA = join(REPO_ROOT, "prisma", "schema.prisma");

describe("Master-data branch-scope enforcement", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;

  let branch01Id: string;
  let branch02Id: string;
  let hqToken: string;
  let manager01Token: string; // QUAN_LY_CN of CN01
  let cashier01Token: string; // THU_NGAN of CN01

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "test-jwt-secret-md";
    process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-md";
    process.env.REDIS_URL = "redis://localhost:6379";

    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], {
      env: { ...process.env, DATABASE_URL: db.url },
      stdio: "inherit",
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    auth = app.get(AuthService);

    // Seed branches.
    const b01 = await prisma.branch.create({
      data: { code: "MC01", name: "Master CN01", address: "Addr 1", phone: "0901111111" },
    });
    const b02 = await prisma.branch.create({
      data: { code: "MC02", name: "Master CN02", address: "Addr 2", phone: "0902222222" },
    });
    branch01Id = b01.id;
    branch02Id = b02.id;

    const pwHash = await argon2.hash("Password123");

    // HQ user (chain-wide).
    await prisma.appUser.create({
      data: {
        username: "md-hq",
        passwordHash: pwHash,
        role: "QUAN_TRI_HQ",
        chainWide: true,
        mustChangePassword: false,
        tokenVersion: 0,
      },
    });
    hqToken = (await auth.login({ username: "md-hq", password: "Password123" })).accessToken;

    // QUAN_LY_CN of CN01 only.
    await prisma.appUser.create({
      data: {
        username: "md-manager01",
        passwordHash: pwHash,
        role: "QUAN_LY_CN",
        chainWide: false,
        mustChangePassword: false,
        tokenVersion: 0,
        branches: { create: { branchId: branch01Id } },
      },
    });
    manager01Token = (
      await auth.login({ username: "md-manager01", password: "Password123" })
    ).accessToken;

    // THU_NGAN of CN01 only.
    await prisma.appUser.create({
      data: {
        username: "md-cashier01",
        passwordHash: pwHash,
        role: "THU_NGAN",
        chainWide: false,
        mustChangePassword: false,
        tokenVersion: 0,
        branches: { create: { branchId: branch01Id } },
      },
    });
    cashier01Token = (
      await auth.login({ username: "md-cashier01", password: "Password123" })
    ).accessToken;

    // Seed suppliers: one chain-wide, one for CN01, one for CN02.
    await prisma.supplier.create({
      data: { name: "NCC Chain-wide", scope: "CHAIN_WIDE", status: "ACTIVE" },
    });
    await prisma.supplier.create({
      data: {
        name: "NCC CN01 only",
        scope: "BRANCH_SPECIFIC",
        status: "ACTIVE",
        branchId: branch01Id,
      },
    });
    await prisma.supplier.create({
      data: {
        name: "NCC CN02 only",
        scope: "BRANCH_SPECIFIC",
        status: "ACTIVE",
        branchId: branch02Id,
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  // ─── HQ sees all suppliers ────────────────────────────────────────────────

  it("HQ sees chain-wide + all branch-specific suppliers", async () => {
    const res = await request(app.getHttpServer())
      .get("/master-data/suppliers")
      .set("Authorization", `Bearer ${hqToken}`)
      .expect(200);

    const names: string[] = res.body.data.map((s: { name: string }) => s.name);
    expect(names).toContain("NCC Chain-wide");
    expect(names).toContain("NCC CN01 only");
    expect(names).toContain("NCC CN02 only");
  });

  // ─── CN01 scoped users see only chain-wide + CN01 ─────────────────────────

  it("QUAN_LY_CN of CN01 sees chain-wide + CN01 suppliers, NOT CN02", async () => {
    const res = await request(app.getHttpServer())
      .get("/master-data/suppliers")
      .set("Authorization", `Bearer ${manager01Token}`)
      .expect(200);

    const names: string[] = res.body.data.map((s: { name: string }) => s.name);
    expect(names).toContain("NCC Chain-wide");
    expect(names).toContain("NCC CN01 only");
    expect(names).not.toContain("NCC CN02 only");
  });

  it("THU_NGAN of CN01 sees chain-wide + CN01 suppliers, NOT CN02", async () => {
    const res = await request(app.getHttpServer())
      .get("/master-data/suppliers")
      .set("Authorization", `Bearer ${cashier01Token}`)
      .expect(200);

    const names: string[] = res.body.data.map((s: { name: string }) => s.name);
    expect(names).toContain("NCC Chain-wide");
    expect(names).toContain("NCC CN01 only");
    expect(names).not.toContain("NCC CN02 only");
  });

  // ─── QUAN_LY_CN creates branch-specific supplier → PENDING_HQ ────────────

  it("QUAN_LY_CN of CN01 creates branch-specific supplier → PENDING_HQ", async () => {
    const res = await request(app.getHttpServer())
      .post("/master-data/suppliers")
      .set("Authorization", `Bearer ${manager01Token}`)
      .send({
        name: "NCC Created by QL",
        scope: "BRANCH_SPECIFIC",
        branchId: branch01Id,
      })
      .expect(201);

    expect(res.body.status).toBe("PENDING_HQ");
    expect(res.body.branchId).toBe(branch01Id);
  });

  it("PENDING_HQ supplier is visible to CN01 users in the list", async () => {
    const res = await request(app.getHttpServer())
      .get("/master-data/suppliers")
      .set("Authorization", `Bearer ${manager01Token}`)
      .expect(200);

    const names: string[] = res.body.data.map((s: { name: string }) => s.name);
    expect(names).toContain("NCC Created by QL");
  });

  it("PENDING_HQ supplier is NOT visible to CN02 (different branch)", async () => {
    // CN02 user — no token yet; create inline.
    const pwHash = await argon2.hash("Password123");
    await prisma.appUser.create({
      data: {
        username: "md-manager02",
        passwordHash: pwHash,
        role: "QUAN_LY_CN",
        chainWide: false,
        mustChangePassword: false,
        tokenVersion: 0,
        branches: { create: { branchId: branch02Id } },
      },
    });
    const { accessToken: manager02Token } = await auth.login({
      username: "md-manager02",
      password: "Password123",
    });

    const res = await request(app.getHttpServer())
      .get("/master-data/suppliers")
      .set("Authorization", `Bearer ${manager02Token}`)
      .expect(200);

    const names: string[] = res.body.data.map((s: { name: string }) => s.name);
    expect(names).not.toContain("NCC Created by QL");
    expect(names).not.toContain("NCC CN01 only");
  });

  // ─── Cross-branch supplier creation → 403 ─────────────────────────────────

  it("QUAN_LY_CN of CN01 creating BRANCH_SPECIFIC supplier for CN02 → 403", async () => {
    await request(app.getHttpServer())
      .post("/master-data/suppliers")
      .set("Authorization", `Bearer ${manager01Token}`)
      .send({
        name: "NCC Rogue",
        scope: "BRANCH_SPECIFIC",
        branchId: branch02Id, // not their branch
      })
      .expect(403);
  });

  // ─── Unauthenticated → 401 ────────────────────────────────────────────────

  it("supplier list without token → 401", async () => {
    await request(app.getHttpServer()).get("/master-data/suppliers").expect(401);
  });
});
