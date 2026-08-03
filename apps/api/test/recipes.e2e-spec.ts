/**
 * Ticket-type recipe CRUD integration tests — real Postgres via testcontainer.
 *
 * Covers: PUT sets a recipe; a second PUT replaces it wholesale; list filters by
 * ticket type; duplicate/unknown ingredient rejected.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { RecipesService } from "../src/inventory/recipes/recipes.service";
import type { BranchAccess } from "../src/platform/rbac/branch-access";

const SCHEMA_PATH = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");
const HQ: BranchAccess = { chainWide: true, branchIds: [] };

describe("ticket-type recipes (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let service: RecipesService;

  let ticketTypeId: string;
  let beefId: string;
  let riceId: string;
  let branchId: string;

  beforeAll(async () => {
    db = await startTestDb();
    delete process.env.APP_DATABASE_URL;
    process.env.DATABASE_URL = db.url;
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA_PATH], {
      env: { ...process.env, DATABASE_URL: db.url },
      stdio: "inherit",
    });

    prisma = new PrismaService();
    await prisma.$connect();
    service = new RecipesService(prisma, new AuditService(prisma));

    const kg = await prisma.unit.create({ data: { code: "KG", name: "Kilogram" } });
    const group = await prisma.ingredientGroup.create({ data: { name: "Chung" } });
    beefId = (await prisma.ingredient.create({ data: { code: "NL001", name: "Bò", groupId: group.id, unitId: kg.id } })).id;
    riceId = (await prisma.ingredient.create({ data: { code: "NL002", name: "Gạo", groupId: group.id, unitId: kg.id } })).id;
    ticketTypeId = (await prisma.ticketType.create({ data: { name: "Người lớn" } })).id;
    branchId = (await prisma.branch.create({ data: { code: "CN1", name: "CN1", address: "x", phone: "0900000000" } })).id;
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("sets a recipe and lists it back with ingredient names", async () => {
    const res = await service.setRecipe(
      ticketTypeId,
      { lines: [{ ingredientId: beefId, qtyBase: 0.2 }, { ingredientId: riceId, qtyBase: 0.15 }] },
      "hq-1",
      "QUAN_TRI_HQ",
      HQ,
    );
    expect(res.data).toHaveLength(2);
    expect(res.data.find((l) => l.ingredientId === beefId)?.qtyBase).toBe(0.2);
    expect(res.data.find((l) => l.ingredientId === beefId)?.ingredientName).toBe("Bò");
  });

  it("replaces the whole recipe on a second PUT", async () => {
    const res = await service.setRecipe(
      ticketTypeId,
      { lines: [{ ingredientId: beefId, qtyBase: 0.3 }] },
      "hq-1",
      "QUAN_TRI_HQ",
      HQ,
    );
    expect(res.data).toHaveLength(1);
    expect(res.data[0].qtyBase).toBe(0.3);
    const list = await service.list(ticketTypeId);
    expect(list.data).toHaveLength(1);
  });

  it("rejects a duplicate ingredient in one recipe", async () => {
    await expect(
      service.setRecipe(ticketTypeId, { lines: [{ ingredientId: beefId, qtyBase: 1 }, { ingredientId: beefId, qtyBase: 2 }] }, "hq-1", "QUAN_TRI_HQ", HQ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an unknown ingredient", async () => {
    await expect(
      service.setRecipe(ticketTypeId, { lines: [{ ingredientId: "no-such", qtyBase: 1 }] }, "hq-1", "QUAN_TRI_HQ", HQ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("clears a recipe with an empty line set", async () => {
    const res = await service.setRecipe(ticketTypeId, { lines: [] }, "hq-1", "QUAN_TRI_HQ", HQ);
    expect(res.data).toHaveLength(0);
  });

  it("stores a branch override separately from the chain-wide recipe", async () => {
    await service.setRecipe(ticketTypeId, { lines: [{ ingredientId: beefId, qtyBase: 0.2 }] }, "hq-1", "QUAN_TRI_HQ", HQ);
    await service.setRecipe(ticketTypeId, { lines: [{ ingredientId: beefId, qtyBase: 0.5 }] }, "hq-1", "QUAN_TRI_HQ", HQ, branchId);

    const chain = await service.list(ticketTypeId); // chain-wide default
    const override = await service.list(ticketTypeId, branchId);
    expect(chain.data[0].qtyBase).toBe(0.2);
    expect(chain.data[0].branchId).toBeNull();
    expect(override.data[0].qtyBase).toBe(0.5);
    expect(override.data[0].branchId).toBe(branchId);
  });

  it("denies setting a branch override outside the caller's scope", async () => {
    const memberOther: BranchAccess = { chainWide: false, branchIds: ["other-branch"] };
    await expect(
      service.setRecipe(ticketTypeId, { lines: [{ ingredientId: beefId, qtyBase: 0.4 }] }, "mgr", "QUAN_LY_CN", memberOther, branchId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
