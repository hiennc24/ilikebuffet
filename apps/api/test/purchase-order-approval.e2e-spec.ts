/**
 * Purchase-order approval integration tests — real Postgres via testcontainer.
 *
 * Covers: an over-threshold PO must be APPROVED before it can be sent; approve
 * stamps approvedBy/At; a PO at or under the branch threshold sends straight from
 * DRAFT; reject returns an APPROVED order to DRAFT and clears the stamp.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { PurchaseOrdersService } from "../src/inventory/purchase-orders/purchase-orders.service";
import type { BranchAccess } from "../src/platform/rbac/branch-access";

const SCHEMA_PATH = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");

describe("purchase-order approval (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let service: PurchaseOrdersService;

  const HQ: BranchAccess = { chainWide: true, branchIds: [] };
  const BRANCH = "poa-branch";
  const THRESHOLD = 500_000;

  let supplierId: string;
  let ingredientId: string;
  let unitId: string;

  const create = (qty: number, unitPriceVnd: number) =>
    service.create({ branchId: BRANCH, supplierId, lines: [{ ingredientId, unitId, qty, unitPriceVnd }] }, "thukho-1", "THU_KHO", HQ);

  beforeAll(async () => {
    db = await startTestDb();
    delete process.env.APP_DATABASE_URL;
    process.env.DATABASE_URL = db.url;
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA_PATH], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });

    prisma = new PrismaService();
    await prisma.$connect();
    service = new PurchaseOrdersService(prisma, new AuditService(prisma));

    await prisma.branch.create({ data: { id: BRANCH, code: "POA", name: "POA", address: "x", phone: "0900000000", poApprovalThresholdVnd: THRESHOLD } });
    const kg = await prisma.unit.create({ data: { code: "KG", name: "Kilogram" } });
    unitId = kg.id;
    const group = await prisma.ingredientGroup.create({ data: { name: "Thịt" } });
    ingredientId = (await prisma.ingredient.create({ data: { code: "NL001", name: "Bò", groupId: group.id, unitId: kg.id } })).id;
    supplierId = (await prisma.supplier.create({ data: { name: "NCC 1" } })).id;
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("blocks sending an over-threshold PO until it is approved", async () => {
    const po = await create(1, 900_000); // 900k > 500k
    expect(po.needsApproval).toBe(true);

    await expect(service.send(po.id, "thukho-1", "THU_KHO", HQ)).rejects.toBeInstanceOf(BadRequestException);

    const approved = await service.approve(po.id, "manager-1", "QUAN_LY_CN", HQ);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedBy).toBe("manager-1");
    expect(approved.approvedAt).toBeTruthy();

    const sent = await service.send(po.id, "thukho-1", "THU_KHO", HQ);
    expect(sent.status).toBe("SENT");
  });

  it("sends an at/under-threshold PO straight from DRAFT", async () => {
    const po = await create(1, 400_000); // 400k < 500k
    expect(po.needsApproval).toBe(false);
    const sent = await service.send(po.id, "thukho-1", "THU_KHO", HQ);
    expect(sent.status).toBe("SENT");
  });

  it("rejects an APPROVED PO back to DRAFT and clears the approval stamp", async () => {
    const po = await create(1, 900_000);
    await service.approve(po.id, "manager-1", "QUAN_LY_CN", HQ);
    const rejected = await service.reject(po.id, "manager-1", "QUAN_LY_CN", HQ);
    expect(rejected.status).toBe("DRAFT");
    expect(rejected.approvedBy).toBeNull();
    expect(rejected.approvedAt).toBeNull();
  });

  it("refuses to approve a non-DRAFT PO and reject a non-APPROVED PO", async () => {
    const po = await create(1, 900_000);
    await service.approve(po.id, "manager-1", "QUAN_LY_CN", HQ);
    // already APPROVED → cannot approve again
    await expect(service.approve(po.id, "manager-1", "QUAN_LY_CN", HQ)).rejects.toBeInstanceOf(BadRequestException);
    await service.send(po.id, "thukho-1", "THU_KHO", HQ);
    // SENT → cannot reject
    await expect(service.reject(po.id, "manager-1", "QUAN_LY_CN", HQ)).rejects.toBeInstanceOf(BadRequestException);
  });
});
