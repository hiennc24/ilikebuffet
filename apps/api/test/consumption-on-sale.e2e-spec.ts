/**
 * E2E: auto stock-deduction on sale, via the real HTTP bill flow (AppModule).
 *
 * Proves the SalesModule → InventoryModule wiring and that the consumption hook
 * fires: creating a bill deducts Σ(recipe × ticket qty) from branch stock, and
 * cancelling it restores the stock. Uses a real Postgres testcontainer.
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

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCHEMA = join(REPO_ROOT, "prisma", "schema.prisma");
const PIN = "123456";

describe("auto stock-deduction on sale (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;

  let branchId: string;
  let deviceId: string;
  let shiftId: string;
  let ticketTypeId: string;
  let ingredientId: string;
  let cashierId: string;
  let managerId: string;
  let cashierToken: string;

  const onHand = () =>
    prisma.inventoryBalance
      .findUnique({ where: { branchId_ingredientId: { branchId, ingredientId } } })
      .then((b) => (b ? Number(b.qtyBase) : 0));

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "test-secret-consume";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-consume";
    process.env.REDIS_URL = "redis://localhost:6379";
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], {
      env: { ...process.env, DATABASE_URL: db.url },
      stdio: "inherit",
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const branch = await prisma.branch.create({ data: { code: "CS01", name: "Consume", address: "x", phone: "0900000009" } });
    branchId = branch.id;
    const device = await prisma.device.create({ data: { branchId, secretHash: await argon2.hash("s"), label: "POS" } });
    deviceId = device.deviceId;

    const tt = await prisma.ticketType.create({ data: { name: "Người lớn", displayOrder: 0 } });
    ticketTypeId = tt.id;
    const tw = await prisma.timeWindow.create({ data: { name: "Cả ngày", startMinute: 0, endMinute: 1440, displayOrder: 0 } });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const version = await prisma.priceBookVersion.create({
      data: { name: "V1", effectiveFrom: new Date(yesterday.toISOString().slice(0, 10) + "T00:00:00Z") },
    });
    for (const dayType of ["REGULAR", "WEEKEND", "HOLIDAY"]) {
      await prisma.priceCell.create({ data: { versionId: version.id, ticketTypeId, timeWindowId: tw.id, dayType, priceVnd: 200_000 } });
    }

    // Ingredient + recipe (0.2 kg / ticket) + 100 kg on hand @ 20000.
    const kg = await prisma.unit.create({ data: { code: "KG", name: "Kilogram" } });
    const group = await prisma.ingredientGroup.create({ data: { name: "Chung" } });
    const ing = await prisma.ingredient.create({ data: { code: "NL001", name: "Bò", groupId: group.id, unitId: kg.id } });
    ingredientId = ing.id;
    await prisma.ticketTypeRecipe.create({ data: { ticketTypeId, ingredientId, qtyBase: 0.2 } });
    await prisma.inventoryBalance.create({ data: { branchId, ingredientId, qtyBase: 100, avgCostVnd: 20_000 } });

    const cashier = await prisma.appUser.create({
      data: { username: "cs-cashier", passwordHash: await argon2.hash("Password123"), role: "THU_NGAN", mustChangePassword: false, tokenVersion: 0 },
    });
    cashierId = cashier.id;
    await prisma.userBranch.create({ data: { userId: cashierId, branchId } });
    cashierToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ username: "cs-cashier", password: "Password123" }).expect(201)
    ).body.accessToken as string;

    const manager = await prisma.appUser.create({
      data: {
        username: "cs-manager",
        passwordHash: await argon2.hash("Password123"),
        role: "QUAN_LY_CN",
        mustChangePassword: false,
        tokenVersion: 0,
        approvalPinHash: await argon2.hash(PIN),
      },
    });
    managerId = manager.id;
    await prisma.userBranch.create({ data: { userId: managerId, branchId } });

    const shift = await prisma.shift.create({
      data: {
        branchId,
        deviceId,
        businessDate: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z"),
        status: "OPEN",
        openedBy: cashierId,
        openingCashVnd: 0,
      },
    });
    shiftId = shift.id;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it("deducts stock on bill create and restores it on cancel", async () => {
    expect(await onHand()).toBe(100);

    const createRes = await request(app.getHttpServer())
      .post("/sales/bills")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ branchId, deviceId, shiftId, lines: [{ ticketTypeId, qty: 3 }], clientUuid: "cs-uuid-1" })
      .expect(201);
    const billId = createRes.body.id as string;

    // 3 tickets × 0.2 kg = 0.6 kg consumed.
    expect(await onHand()).toBeCloseTo(99.4, 3);
    const issue = await prisma.stockMovement.findMany({ where: { refType: "BILL", refId: billId } });
    expect(issue).toHaveLength(1);
    expect(issue[0].type).toBe("ISSUE");

    // Cancel with manager PIN → stock restored.
    await request(app.getHttpServer())
      .post(`/sales/bills/${billId}/cancel`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ managerId, pin: PIN, reason: "test", deviceId })
      .expect(201);

    expect(await onHand()).toBeCloseTo(100, 3);
    const reversal = await prisma.stockMovement.findMany({ where: { refType: "BILL_REVERSAL", refId: billId } });
    expect(reversal).toHaveLength(1);
  });
});
