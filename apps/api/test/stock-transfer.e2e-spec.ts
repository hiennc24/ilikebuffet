/**
 * Inter-branch stock transfer (M10) — real Postgres via testcontainer.
 *
 * Covers: qty leaves source + enters destination carrying the source's cost
 * (blended into the destination average); over-transfer is blocked at the source;
 * access to both ends is required; and balance == Σ movements holds on both.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { InventoryBalanceService } from "../src/inventory/inventory-balance.service";
import { StockTransfersService } from "../src/inventory/transfers/stock-transfers.service";
import type { BranchAccess } from "../src/platform/rbac/branch-access";

const SCHEMA = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");
const HQ: BranchAccess = { chainWide: true, branchIds: [] };

describe("stock transfer (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let balance: InventoryBalanceService;
  let transfers: StockTransfersService;

  const A = "tr-a";
  const B = "tr-b";
  let beefId: string;

  const qtyOf = (branchId: string, ingredientId: string) =>
    prisma.inventoryBalance.findUnique({ where: { branchId_ingredientId: { branchId, ingredientId } } });

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });

    prisma = new PrismaService();
    await prisma.$connect();
    balance = new InventoryBalanceService();
    transfers = new StockTransfersService(prisma, new AuditService(prisma), balance);

    for (const [id, code] of [[A, "TRA"], [B, "TRB"]] as const) {
      await prisma.branch.create({ data: { id, code, name: code, address: "x", phone: "0900000000" } });
    }
    const kg = await prisma.unit.create({ data: { code: "KG", name: "Kilogram" } });
    const group = await prisma.ingredientGroup.create({ data: { name: "Chung" } });
    beefId = (await prisma.ingredient.create({ data: { code: "NL001", name: "Bò", groupId: group.id, unitId: kg.id } })).id;

    // Source A: 100 kg @ 20000. Dest B: 10 kg @ 30000 (to prove the blend).
    await prisma.withTx(async (tx) => {
      await balance.applyDelta(tx, { branchId: A, ingredientId: beefId, type: "RECEIPT", qtyBase: 100, unitCostVnd: 20_000, createdBy: "seed" });
      await balance.applyDelta(tx, { branchId: B, ingredientId: beefId, type: "RECEIPT", qtyBase: 10, unitCostVnd: 30_000, createdBy: "seed" });
    });
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("moves qty from source to destination carrying the source cost", async () => {
    const res = await transfers.create(
      { fromBranchId: A, toBranchId: B, lines: [{ ingredientId: beefId, qtyBase: 30 }] },
      "mgr",
      "QUAN_TRI_HQ",
      HQ,
    );
    expect(res.code).toBe("TR-TRA-0001");
    expect(res.lines[0].unitCostVnd).toBe(20_000); // source avg carried

    const src = await qtyOf(A, beefId);
    const dst = await qtyOf(B, beefId);
    expect(Number(src?.qtyBase)).toBe(70); // 100 − 30
    expect(src?.avgCostVnd).toBe(20_000); // issue leaves source avg
    expect(Number(dst?.qtyBase)).toBe(40); // 10 + 30
    // Blend at dest: (10×30000 + 30×20000) / 40 = 22_500.
    expect(dst?.avgCostVnd).toBe(22_500);

    const moves = await prisma.stockMovement.findMany({ where: { refType: "TRANSFER", refId: res.id } });
    expect(moves).toHaveLength(2);
    expect(moves.some((m) => m.branchId === A && m.type === "ISSUE")).toBe(true);
    expect(moves.some((m) => m.branchId === B && m.type === "RECEIPT")).toBe(true);
  });

  it("blocks a transfer larger than the source on-hand", async () => {
    await expect(
      transfers.create({ fromBranchId: A, toBranchId: B, lines: [{ ingredientId: beefId, qtyBase: 1000 }] }, "mgr", "QUAN_TRI_HQ", HQ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires access to both branches", async () => {
    const memberAOnly: BranchAccess = { chainWide: false, branchIds: [A] };
    await expect(
      transfers.create({ fromBranchId: A, toBranchId: B, lines: [{ ingredientId: beefId, qtyBase: 1 }] }, "mgr", "QUAN_LY_CN", memberAOnly),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a same-branch transfer", async () => {
    await expect(
      transfers.create({ fromBranchId: A, toBranchId: A, lines: [{ ingredientId: beefId, qtyBase: 1 }] }, "mgr", "QUAN_TRI_HQ", HQ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("keeps balance == Σ movements on both branches", async () => {
    for (const branchId of [A, B]) {
      const moves = await prisma.stockMovement.findMany({ where: { branchId, ingredientId: beefId } });
      const sum = moves.reduce((s, m) => s + Number(m.qtyBase), 0);
      const bal = await qtyOf(branchId, beefId);
      expect(Number(bal?.qtyBase)).toBeCloseTo(sum, 3);
    }
  });
});
