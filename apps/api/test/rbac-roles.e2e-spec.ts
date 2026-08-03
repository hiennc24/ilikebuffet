/**
 * Role CRUD API (RBAC-01/R3) — real Postgres testcontainer.
 *
 * Covers: capability catalog, role list (system roles + userCount), create/edit/
 * set-capabilities/delete, the chain:user:manage gate, unknown-capability 400,
 * delete-with-users 409, and the last-admin-role safety net (can't strip/delete the
 * final holder of chain:user:manage).
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

describe("RBAC roles (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;
  const token: Record<string, string> = {};

  const login = async (username: string) =>
    (await request(app.getHttpServer()).post("/auth/login").send({ username, password: "Password123" }).expect(201)).body.accessToken as string;
  const auth = (role: string) => ({ Authorization: `Bearer ${token[role]}` });

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

    const hash = await argon2.hash("Password123");
    for (const [username, role, chainWide] of [
      ["hq", "QUAN_TRI_HQ", true],
      ["cashier", "THU_NGAN", false],
    ] as const) {
      await prisma.appUser.create({ data: { username, passwordHash: hash, role, chainWide, mustChangePassword: false } });
      token[role] = await login(username);
    }
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it("gates every route on chain:user:manage (cashier → 403)", async () => {
    await request(app.getHttpServer()).get("/rbac/roles").set(auth("THU_NGAN")).expect(403);
    await request(app.getHttpServer()).post("/rbac/roles").set(auth("THU_NGAN")).send({ code: "X_ROLE", name: "x", capabilities: [] }).expect(403);
  });

  it("returns the capability catalog (grouped, VN labels)", async () => {
    const res = await request(app.getHttpServer()).get("/rbac/capabilities").set(auth("QUAN_TRI_HQ")).expect(200);
    expect(Array.isArray(res.body.groups)).toBe(true);
    expect(res.body.groups[0].label).toBeTruthy();
    expect(res.body.groups.flatMap((g: { actions: unknown[] }) => g.actions).length).toBeGreaterThan(10);
  });

  it("lists system roles with capabilities + userCount", async () => {
    const res = await request(app.getHttpServer()).get("/rbac/roles").set(auth("QUAN_TRI_HQ")).expect(200);
    const hq = (res.body.data as { code: string; isSystem: boolean; userCount: number; capabilities: string[] }[]).find((r) => r.code === "QUAN_TRI_HQ")!;
    expect(hq.isSystem).toBe(true);
    expect(hq.userCount).toBe(1);
    expect(hq.capabilities).toContain("chain:user:manage");
  });

  it("creates, edits, and sets capabilities on a custom role", async () => {
    await request(app.getHttpServer()).post("/rbac/roles").set(auth("QUAN_TRI_HQ"))
      .send({ code: "CUA_HANG_TRUONG", name: "Cửa hàng trưởng", capabilities: ["cash:read", "report:view"] }).expect(201);

    await request(app.getHttpServer()).put("/rbac/roles/CUA_HANG_TRUONG").set(auth("QUAN_TRI_HQ")).send({ name: "CHT" }).expect(200);
    await request(app.getHttpServer()).put("/rbac/roles/CUA_HANG_TRUONG/capabilities").set(auth("QUAN_TRI_HQ")).send({ capabilities: ["cash:read"] }).expect(200);

    const res = await request(app.getHttpServer()).get("/rbac/roles").set(auth("QUAN_TRI_HQ")).expect(200);
    const role = (res.body.data as { code: string; name: string; isSystem: boolean; capabilities: string[] }[]).find((r) => r.code === "CUA_HANG_TRUONG")!;
    expect(role.name).toBe("CHT");
    expect(role.isSystem).toBe(false);
    expect(role.capabilities).toEqual(["cash:read"]);
  });

  it("rejects a capability outside the catalog (400)", async () => {
    await request(app.getHttpServer()).post("/rbac/roles").set(auth("QUAN_TRI_HQ"))
      .send({ code: "BOGUS_ROLE", name: "b", capabilities: ["not:a:real:cap"] }).expect(400);
  });

  it("blocks deleting a role that still has users (409)", async () => {
    await prisma.appUser.create({ data: { username: "cht-user", passwordHash: await argon2.hash("Password123"), role: "CUA_HANG_TRUONG", chainWide: false, mustChangePassword: false } });
    await request(app.getHttpServer()).delete("/rbac/roles/CUA_HANG_TRUONG").set(auth("QUAN_TRI_HQ")).expect(409);
    // Reassign the user away, then delete succeeds.
    await prisma.appUser.update({ where: { username: "cht-user" }, data: { role: "THU_NGAN" } });
    await request(app.getHttpServer()).delete("/rbac/roles/CUA_HANG_TRUONG").set(auth("QUAN_TRI_HQ")).expect(200);
  });

  it("won't strip chain:user:manage from the last role that has it", async () => {
    // Seeded admins: QUAN_TRI_HQ + QUAN_LY_CN. Removing it from QUAN_LY_CN is fine…
    const qlcn = await request(app.getHttpServer()).get("/rbac/roles").set(auth("QUAN_TRI_HQ")).expect(200);
    const caps = (qlcn.body.data as { code: string; capabilities: string[] }[]).find((r) => r.code === "QUAN_LY_CN")!.capabilities.filter((c) => c !== "chain:user:manage");
    await request(app.getHttpServer()).put("/rbac/roles/QUAN_LY_CN/capabilities").set(auth("QUAN_TRI_HQ")).send({ capabilities: caps }).expect(200);
    // …but now QUAN_TRI_HQ is the last holder — stripping it is blocked.
    await request(app.getHttpServer()).put("/rbac/roles/QUAN_TRI_HQ/capabilities").set(auth("QUAN_TRI_HQ")).send({ capabilities: ["cash:read"] }).expect(409);
  });
});
