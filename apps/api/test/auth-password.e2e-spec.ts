/**
 * E2E: Password policy + account lockout + mustChangePassword gate.
 *
 * Proves:
 *  1. Successful login → tokens + mustChangePassword flag.
 *  2. Min 8 chars enforced at change-password.
 *  3. Lock 15min after 5 consecutive failures (atomic increment).
 *  4. mustChangePassword cleared after change-password.
 *  5. audit row written for auth.login_failed.
 *  6. Unknown username → 401 (no user enumeration — same status as wrong-password).
 *  7. Passwords argon2-hashed in DB.
 *  8. Missing required fields → 400.
 *  9. mcp=true user → 403 on a normal route, 201 on change-password, normal access after.
 * 10. L10: refresh token rejected when presented as access token (typ check).
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient, Role } from "@prisma/client";
import * as argon2 from "argon2";
import request from "supertest";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCHEMA = join(REPO_ROOT, "prisma", "schema.prisma");

describe("Auth password policy + lockout + mcp gate", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "test-jwt-secret-pw";
    process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-pw";
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
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  async function createUser(
    username: string,
    opts: { mustChangePassword?: boolean; role?: Role; chainWide?: boolean } = {},
  ) {
    const passwordHash = await argon2.hash("Password123");
    return prisma.appUser.create({
      data: {
        username,
        passwordHash,
        role: opts.role ?? Role.THU_NGAN,
        chainWide: opts.chainWide ?? false,
        mustChangePassword: opts.mustChangePassword ?? false,
        tokenVersion: 0,
      },
    });
  }

  // ─── 1. Successful login ──────────────────────────────────────────────────

  it("valid credentials → 201 with accessToken + refreshToken", async () => {
    await createUser("pw-login-test");
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "pw-login-test", password: "Password123" })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(typeof res.body.mustChangePassword).toBe("boolean");
  });

  // ─── 2. mustChangePassword returned on first login ────────────────────────

  it("mustChangePassword=true is returned in login response", async () => {
    await createUser("pw-first-login", { mustChangePassword: true });
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "pw-first-login", password: "Password123" })
      .expect(201);
    expect(res.body.mustChangePassword).toBe(true);
  });

  // ─── 3. Change password — min 8 chars enforced ────────────────────────────

  it("change-password with newPassword < 8 chars → 400", async () => {
    await createUser("pw-change-short");
    const { body } = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "pw-change-short", password: "Password123" })
      .expect(201);
    const token: string = body.accessToken;

    const res = await request(app.getHttpServer())
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "Password123", newPassword: "short" })
      .expect(400);
    expect(res.body.message).toMatch(/8/);
  });

  it("change-password with valid newPassword → 201 + mustChangePassword cleared", async () => {
    await createUser("pw-change-ok", { mustChangePassword: true });
    const { body } = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "pw-change-ok", password: "Password123" })
      .expect(201);
    const token: string = body.accessToken;

    await request(app.getHttpServer())
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "Password123", newPassword: "NewPass456!" })
      .expect(201);

    const user = await prisma.appUser.findUnique({ where: { username: "pw-change-ok" } });
    expect(user!.mustChangePassword).toBe(false);
  });

  // ─── 4. Wrong password → 401 (not 404 — no user enumeration) ────────────

  it("unknown username → 401, not 404 (no user enumeration)", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "nonexistent-user-xyz", password: "any" })
      .expect(401);
  });

  // ─── 5. 5 failures → account locked ─────────────────────────────────────

  it("5 consecutive wrong passwords → account locked (lockedUntil set)", async () => {
    await createUser("pw-lockout-test");

    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ username: "pw-lockout-test", password: "WrongPass!" })
        .expect(401);
    }

    const user = await prisma.appUser.findUnique({ where: { username: "pw-lockout-test" } });
    expect(user!.lockedUntil).not.toBeNull();
    const lockMs = user!.lockedUntil!.getTime() - Date.now();
    expect(lockMs).toBeGreaterThan(14 * 60 * 1000);
    expect(lockMs).toBeLessThan(16 * 60 * 1000);
  });

  it("locked account → login returns 401 even with correct password", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "pw-lockout-test", password: "Password123" })
      .expect(401);
  });

  // ─── 6. audit row for login_failed ───────────────────────────────────────

  it("failed login writes audit row with action auth.login_failed", async () => {
    await createUser("pw-audit-test");

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "pw-audit-test", password: "WrongPass!" })
      .expect(401);

    await new Promise((r) => setTimeout(r, 300));

    const superuser = new PrismaClient({ datasources: { db: { url: db.url } } });
    try {
      const rows = await superuser.auditLog.findMany({
        where: { action: "auth.login_failed" },
        orderBy: { createdAt: "desc" },
        take: 1,
      });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]!.action).toBe("auth.login_failed");
    } finally {
      await superuser.$disconnect();
    }
  });

  // ─── 7. Passwords are hashed (never stored plaintext) ────────────────────

  it("passwordHash in DB is an argon2 hash, not plaintext", async () => {
    await createUser("pw-hash-check");
    const user = await prisma.appUser.findUnique({ where: { username: "pw-hash-check" } });
    expect(user!.passwordHash).not.toBe("Password123");
    expect(user!.passwordHash).toMatch(/^\$argon2/);
  });

  // ─── 8. Missing required fields → 400 ────────────────────────────────────

  it("login with missing username → 400", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ password: "Password123" })
      .expect(400);
  });

  // ─── 9. mustChangePassword gate ──────────────────────────────────────────

  it("mcp=true user → 403 on a normal (non-change-password) route", async () => {
    // chainWide=true so the user passes BranchScopeGuard (scope doesn't matter here).
    await createUser("pw-mcp-gate", { mustChangePassword: true, chainWide: true });
    const { body } = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "pw-mcp-gate", password: "Password123" })
      .expect(201);
    expect(body.mustChangePassword).toBe(true);
    const token: string = body.accessToken;

    // logout-all is @Unscoped but NOT @PasswordChangeAllowed → mcp=true → 403.
    await request(app.getHttpServer())
      .post("/auth/logout-all")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("mcp=true user can reach POST /auth/change-password (@PasswordChangeAllowed)", async () => {
    const { body } = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "pw-mcp-gate", password: "Password123" })
      .expect(201);
    const token: string = body.accessToken;

    // change-password must succeed despite mcp=true in token.
    await request(app.getHttpServer())
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "Password123", newPassword: "NewSecure99!" })
      .expect(201);

    const user = await prisma.appUser.findUnique({ where: { username: "pw-mcp-gate" } });
    expect(user!.mustChangePassword).toBe(false);
  });

  it("after password change, fresh login token (mcp=false) reaches normal routes", async () => {
    const { body } = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "pw-mcp-gate", password: "NewSecure99!" })
      .expect(201);
    expect(body.mustChangePassword).toBe(false);
    const freshToken: string = body.accessToken;

    // logout-all should now succeed with mcp=false token.
    await request(app.getHttpServer())
      .post("/auth/logout-all")
      .set("Authorization", `Bearer ${freshToken}`)
      .expect(201);
  });

  // ─── 10. L10: refresh token rejected as access token ─────────────────────

  it("L10: refresh token presented as Authorization Bearer → 401", async () => {
    await createUser("pw-typ-test");
    const { body } = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "pw-typ-test", password: "Password123" })
      .expect(201);
    const refreshToken: string = body.refreshToken;

    // Refresh token has typ="refresh"; JwtStrategy rejects it as an access token.
    await request(app.getHttpServer())
      .post("/auth/logout-all")
      .set("Authorization", `Bearer ${refreshToken}`)
      .expect(401);
  });
});
