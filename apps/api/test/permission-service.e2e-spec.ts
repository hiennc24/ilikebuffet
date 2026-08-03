/**
 * PermissionService integration — resolves role capabilities from DB with a cache.
 * Uses the migration-seeded system roles; verifies fail-closed for unknown roles and
 * that invalidate() makes an edit visible (cache would otherwise hide it within TTL).
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { PermissionService } from "../src/platform/rbac/permission.service";

const SCHEMA = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");

describe("PermissionService (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let perms: PermissionService;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });
    prisma = new PrismaService();
    await prisma.$connect();
    perms = new PermissionService(prisma);
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("resolves seeded system-role capabilities", async () => {
    expect(await perms.can("QUAN_TRI_HQ", "cash:read")).toBe(true);
    expect(await perms.can("THU_NGAN", "cash:create-voucher")).toBe(true);
    expect(await perms.can("THU_KHO", "purchase-order:approve")).toBe(false);
  });

  it("is fail-closed for an unknown role", async () => {
    expect(await perms.can("NO_SUCH_ROLE", "cash:read")).toBe(false);
    expect((await perms.capsOf("NO_SUCH_ROLE")).size).toBe(0);
  });

  it("reflects an edit only after invalidate() (cache)", async () => {
    // Prime the cache for THU_KHO, then grant it a new capability directly in the DB.
    expect(await perms.can("THU_KHO", "cash:read")).toBe(false);
    await prisma.roleCapability.create({ data: { roleId: "THU_KHO", capability: "cash:read" } });

    // Still cached as false within the TTL…
    expect(await perms.can("THU_KHO", "cash:read")).toBe(false);
    // …until we invalidate.
    perms.invalidate("THU_KHO");
    expect(await perms.can("THU_KHO", "cash:read")).toBe(true);
  });
});
