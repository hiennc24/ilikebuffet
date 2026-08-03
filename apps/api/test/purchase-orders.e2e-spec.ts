/**
 * Purchase-order integration tests — real Postgres via testcontainer.
 *
 * Covers: create computes roundVnd(price × qty) line + order totals; per-branch
 * code allocation; branch-scope denial on read/write; DRAFT-only editing;
 * send/cancel lifecycle transitions and their guards; invalid supplier/unit.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { PurchaseOrdersService } from "../src/inventory/purchase-orders/purchase-orders.service";
import type { BranchAccess } from "../src/platform/rbac/branch-access";

const SCHEMA_PATH = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");

describe("purchase orders (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let service: PurchaseOrdersService;

  const HQ: BranchAccess = { chainWide: true, branchIds: [] };
  const BRANCH_A = "po-branch-a";
  const BRANCH_B = "po-branch-b";
  const memberA: BranchAccess = { chainWide: false, branchIds: [BRANCH_A] };

  let supplierId: string;
  let ingredientId: string;
  let purchaseUnitId: string; // thùng = 10 kg

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
    service = new PurchaseOrdersService(prisma, new AuditService(prisma));

    // Seed master data both branches share.
    for (const [id, code] of [
      [BRANCH_A, "CNA"],
      [BRANCH_B, "CNB"],
    ] as const) {
      await prisma.branch.create({
        // High threshold: these lifecycle tests send/cancel directly, without the
        // approval step (which has its own spec).
        data: { id, code, name: code, address: "x", phone: "0900000000", poApprovalThresholdVnd: 100_000_000 },
      });
    }
    const kg = await prisma.unit.create({ data: { code: "KG", name: "Kilogram" } });
    const thung = await prisma.unit.create({ data: { code: "THUNG", name: "Thùng" } });
    purchaseUnitId = thung.id;
    const group = await prisma.ingredientGroup.create({ data: { name: "Thịt" } });
    const ing = await prisma.ingredient.create({
      data: {
        code: "NL001",
        name: "Ba chỉ bò",
        groupId: group.id,
        unitId: kg.id,
        purchaseUnits: { create: { unitId: thung.id, factorToBase: 10 } },
      },
    });
    ingredientId = ing.id;
    const supplier = await prisma.supplier.create({ data: { name: "NCC 1" } });
    supplierId = supplier.id;
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  const line = (qty: number, unitPriceVnd: number) => ({
    ingredientId,
    unitId: purchaseUnitId,
    qty,
    unitPriceVnd,
  });

  it("creates a DRAFT PO with roundVnd line + order totals and a per-branch code", async () => {
    const po = await service.create(
      { branchId: BRANCH_A, supplierId, lines: [line(2.5, 300_000), line(1, 150_000)] },
      "thukho-1",
      "THU_KHO",
      HQ,
    );
    expect(po.status).toBe("DRAFT");
    expect(po.code).toBe("PO-CNA-0001");
    // 2.5 × 300000 = 750000 ; 1 × 150000 = 150000
    expect(po.lines[0].lineTotalVnd).toBe(750_000);
    expect(po.lines[1].lineTotalVnd).toBe(150_000);
    expect(po.totalVnd).toBe(900_000);
    expect(po.lines[0].ingredientName).toBe("Ba chỉ bò");
  });

  it("allocates sequential per-branch codes", async () => {
    const po = await service.create(
      { branchId: BRANCH_A, supplierId, lines: [line(1, 100_000)] },
      "thukho-1",
      "THU_KHO",
      HQ,
    );
    expect(po.code).toBe("PO-CNA-0002");
  });

  it("denies creating a PO outside the caller's branch scope", async () => {
    await expect(
      service.create(
        { branchId: BRANCH_B, supplierId, lines: [line(1, 100_000)] },
        "thukho-1",
        "THU_KHO",
        memberA,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a line whose unit is neither base nor a purchase unit", async () => {
    await expect(
      service.create(
        {
          branchId: BRANCH_A,
          supplierId,
          lines: [{ ingredientId, unitId: "no-such-unit", qty: 1, unitPriceVnd: 1000 }],
        },
        "thukho-1",
        "THU_KHO",
        HQ,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("edits a DRAFT but blocks editing once SENT", async () => {
    const po = await service.create(
      { branchId: BRANCH_A, supplierId, lines: [line(1, 100_000)] },
      "thukho-1",
      "THU_KHO",
      HQ,
    );
    const edited = await service.update(
      po.id,
      { lines: [line(3, 100_000)] },
      "thukho-1",
      "THU_KHO",
      HQ,
    );
    expect(edited.totalVnd).toBe(300_000);

    const sent = await service.send(po.id, "thukho-1", "THU_KHO", HQ);
    expect(sent.status).toBe("SENT");

    await expect(
      service.update(po.id, { note: "late" }, "thukho-1", "THU_KHO", HQ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("cancels a SENT PO but not a cancelled one", async () => {
    const po = await service.create(
      { branchId: BRANCH_A, supplierId, lines: [line(1, 100_000)] },
      "thukho-1",
      "THU_KHO",
      HQ,
    );
    await service.send(po.id, "thukho-1", "THU_KHO", HQ);
    const cancelled = await service.cancel(po.id, "thukho-1", "THU_KHO", HQ);
    expect(cancelled.status).toBe("CANCELLED");
    await expect(service.cancel(po.id, "thukho-1", "THU_KHO", HQ)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("hides other branches' POs from a branch-scoped list", async () => {
    await service.create(
      { branchId: BRANCH_B, supplierId, lines: [line(1, 100_000)] },
      "thukho-1",
      "THU_KHO",
      HQ,
    );
    const scoped = await service.list({}, memberA);
    expect(scoped.data.every((p) => p.branchId === BRANCH_A)).toBe(true);
    const all = await service.list({}, HQ);
    expect(all.data.some((p) => p.branchId === BRANCH_B)).toBe(true);
  });
});
