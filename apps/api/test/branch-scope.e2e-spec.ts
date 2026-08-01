/**
 * E2E: Branch-scope guard + BranchScopeHelper.
 *
 * Proves:
 *  1. THU_NGAN of CN01 hitting a CN02 keyed resource → 403 + audit row.
 *  2. THU_NGAN of CN01 hitting CN01 keyed resource → 200.
 *  3. @Public() route → 200 with no token.
 *  4. @Unscoped() route → 200 with valid token, 401 without.
 *  5. No token on any scoped route → 401.
 *  6. /health (@Public) → 200 without auth.
 *
 *  Keyless scoped route with BranchScopeHelper:
 *  7. A scoped keyless route using BranchScopeHelper.requireScope() returns
 *     ONLY the calling user's branch rows (seed 2 branches; THU_NGAN of CN01
 *     sees only CN01 rows). Proves req.branchScope is populated even with
 *     no branchId in the request.
 *
 * Uses a real Postgres testcontainer + in-process Nest app with a test
 * controller that exercises all annotation modes and the helper.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { Controller, Get, INestApplication, Module, Param, Request } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import request from "supertest";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { Public, Unscoped } from "../src/platform/rbac/decorators";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";
import { BranchScopeHelper } from "../src/platform/rbac/branch-scope.helper";
import type { ScopedRequest } from "../src/platform/rbac/branch-scope.guard";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCHEMA = join(REPO_ROOT, "prisma", "schema.prisma");

/** Minimal test controller exercising all annotation modes + BranchScopeHelper. */
@Controller("test-scope")
class TestScopeController {
  /**
   * Keyed scoped route (no decorator = default scoped).
   * Cross-branch :branchId → 403 via guard. Same-branch → 200.
   */
  @Get("keyed/:branchId")
  keyedRoute(@Param("branchId") branchId: string) {
    void branchId;
    return { ok: true, route: "keyed" };
  }

  /**
   * Keyless scoped route using BranchScopeHelper.requireScope().
   * Returns { branchIds: string[] } filtered to the caller's allowed branches.
   * The test seeds two branch rows on a fictional "items" table; here we
   * simulate the filter by returning the scope's branchIds directly — the
   * real enforcement is the Prisma WHERE filter using the returned BranchFilter.
   */
  @Get("keyless")
  keylessRoute(@Request() req: ScopedRequest) {
    const filter = BranchScopeHelper.requireScope(req);
    // Simulate what a repository would do: return only the allowed branches.
    // In this test we reflect the filter so the test can assert its value.
    return { ok: true, filter };
  }

  /** @Public() — no auth required. */
  @Public()
  @Get("public")
  publicRoute() {
    return { ok: true, route: "public" };
  }

  /** @Unscoped() — auth required, no branch filter. */
  @Unscoped()
  @Get("unscoped")
  unscopedRoute() {
    return { ok: true, route: "unscoped" };
  }
}

@Module({ imports: [AppModule], controllers: [TestScopeController] })
class TestAppModule {}

describe("BranchScopeGuard + BranchScopeHelper", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;

  let branch01Id: string;
  let branch02Id: string;
  let cashierToken: string; // THU_NGAN of branch01

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret";
    process.env.REDIS_URL = "redis://localhost:6379";

    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], {
      env: { ...process.env, DATABASE_URL: db.url },
      stdio: "inherit",
    });

    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    auth = app.get(AuthService);

    const b01 = await prisma.branch.create({
      data: { code: "CN01", name: "Branch 01", address: "Addr 01", phone: "0900000001" },
    });
    const b02 = await prisma.branch.create({
      data: { code: "CN02", name: "Branch 02", address: "Addr 02", phone: "0900000002" },
    });
    branch01Id = b01.id;
    branch02Id = b02.id;

    const passwordHash = await argon2.hash("Password123");
    await prisma.appUser.create({
      data: {
        username: "cashier01",
        passwordHash,
        role: "THU_NGAN",
        chainWide: false,
        mustChangePassword: false,
        tokenVersion: 0,
        branches: { create: { branchId: branch01Id } },
      },
    });

    const result = await auth.login({ username: "cashier01", password: "Password123" });
    cashierToken = result.accessToken;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  // ─── Keyed routes ──────────────────────────────────────────────────────────

  it("THU_NGAN of CN01 hitting CN02 keyed resource → 403", async () => {
    await request(app.getHttpServer())
      .get(`/test-scope/keyed/${branch02Id}`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .expect(403);
  });

  it("cross-branch attempt writes cross_branch_denied audit row", async () => {
    const superuser = new PrismaClient({ datasources: { db: { url: db.url } } });
    try {
      await new Promise((r) => setTimeout(r, 300));
      const rows = await superuser.auditLog.findMany({
        where: { action: "cross_branch_denied" },
      });
      expect(rows.length).toBeGreaterThan(0);
    } finally {
      await superuser.$disconnect();
    }
  });

  it("THU_NGAN of CN01 hitting CN01 keyed resource → 200", async () => {
    await request(app.getHttpServer())
      .get(`/test-scope/keyed/${branch01Id}`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .expect(200);
  });

  // ─── Keyless scoped route uses BranchScopeHelper ─────────────────────────

  it("keyless scoped route with BranchScopeHelper returns only user's branch", async () => {
    const res = await request(app.getHttpServer())
      .get("/test-scope/keyless")
      .set("Authorization", `Bearer ${cashierToken}`)
      .expect(200);

    // The filter must be exactly CN01 — not CN02, not undefined.
    // When user has exactly one branch the helper returns the bare string.
    expect(res.body.filter).toBe(branch01Id);
  });

  it("keyless scoped route: chain-wide user gets undefined filter (sees all)", async () => {
    const passwordHash = await argon2.hash("Password123");
    await prisma.appUser.create({
      data: {
        username: "hq-user",
        passwordHash,
        role: "QUAN_TRI_HQ",
        chainWide: true,
        mustChangePassword: false,
        tokenVersion: 0,
      },
    });
    const { accessToken } = await auth.login({ username: "hq-user", password: "Password123" });

    const res = await request(app.getHttpServer())
      .get("/test-scope/keyless")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    // Chain-wide with no requested branch → filter is undefined (no WHERE clause).
    // JSON serialisation converts undefined to absent/null; accept either.
    expect(res.body.filter == null).toBe(true);
  });

  // ─── @Public() routes ──────────────────────────────────────────────────────

  it("@Public() route → 200 with no token", async () => {
    await request(app.getHttpServer()).get("/test-scope/public").expect(200);
  });

  it("@Public() route → 200 even with a bogus token", async () => {
    await request(app.getHttpServer())
      .get("/test-scope/public")
      .set("Authorization", "Bearer bogus")
      .expect(200);
  });

  // ─── @Unscoped() routes ────────────────────────────────────────────────────

  it("@Unscoped() route with valid token → 200", async () => {
    await request(app.getHttpServer())
      .get("/test-scope/unscoped")
      .set("Authorization", `Bearer ${cashierToken}`)
      .expect(200);
  });

  it("@Unscoped() route with no token → 401", async () => {
    await request(app.getHttpServer()).get("/test-scope/unscoped").expect(401);
  });

  // ─── No token on scoped routes ────────────────────────────────────────────

  it("keyed scoped route with no token → 401", async () => {
    await request(app.getHttpServer())
      .get(`/test-scope/keyed/${branch01Id}`)
      .expect(401);
  });

  it("keyless scoped route with no token → 401", async () => {
    await request(app.getHttpServer()).get("/test-scope/keyless").expect(401);
  });

  // ─── Health endpoint ──────────────────────────────────────────────────────

  it("/health is @Public → 200 with no auth", async () => {
    await request(app.getHttpServer()).get("/health").expect(200);
  });
});
