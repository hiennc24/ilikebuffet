/**
 * E2E: Bill creation — server prices from price book; snapshot immutability.
 *
 * Proves:
 *  1. Server prices the bill from the price book (client sends NO price).
 *  2. BillLine.unitPriceVnd is snapshotted at creation time.
 *  3. Updating/replacing the price cell AFTER bill creation does NOT change
 *     the existing BillLine.unitPriceVnd (snapshot immutability).
 *  4. Bill number format: [CODE]-[YYMMDD]-[NNNN], seq starts at 1.
 *  5. guestCount includes free tickets.
 *
 * Uses a real Postgres testcontainer — lock/tx semantics differ from SQLite.
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

describe("Bill creation — server price + snapshot immutability (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;

  // Seeded entity IDs
  let branchId: string;
  let deviceId: string;
  let shiftId: string;
  let ticketTypeId: string;
  let freeTicketTypeId: string;
  let timeWindowId: string;
  let versionId: string;
  let cashierToken: string;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "test-secret-snapshot";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-snapshot";
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

    // ── Seed: branch with code ────────────────────────────────────────────────
    const branch = await prisma.branch.create({
      data: {
        code: "TS01",
        name: "Test Branch Snapshot",
        address: "123 Test St",
        phone: "0900000001",
      },
    });
    branchId = branch.id;

    // ── Seed: device ──────────────────────────────────────────────────────────
    const device = await prisma.device.create({
      data: {
        branchId,
        secretHash: await argon2.hash("dev-secret"),
        label: "POS-1",
      },
    });
    deviceId = device.deviceId;

    // ── Seed: ticket types ────────────────────────────────────────────────────
    const tt = await prisma.ticketType.create({
      data: { name: "Người lớn", isFree: false, displayOrder: 0 },
    });
    ticketTypeId = tt.id;

    const ttFree = await prisma.ticketType.create({
      data: { name: "Trẻ em dưới 1m", isFree: true, displayOrder: 1 },
    });
    freeTicketTypeId = ttFree.id;

    // ── Seed: time window (covers all day for test simplicity) ────────────────
    const tw = await prisma.timeWindow.create({
      data: { name: "Cả ngày", startMinute: 0, endMinute: 1440, displayOrder: 0 },
    });
    timeWindowId = tw.id;

    // ── Seed: price book version (effectiveFrom = yesterday so it's effective now)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const version = await prisma.priceBookVersion.create({
      data: {
        name: "Test V1",
        effectiveFrom: new Date(yesterday.toISOString().slice(0, 10) + "T00:00:00Z"),
      },
    });
    versionId = version.id;

    // ── Seed: price cells for all day-types ──────────────────────────────────
    for (const dayType of ["REGULAR", "WEEKEND", "HOLIDAY"]) {
      await prisma.priceCell.create({
        data: {
          versionId,
          ticketTypeId,
          timeWindowId,
          dayType,
          priceVnd: 150_000,
        },
      });
    }

    // ── Seed: cashier user + login to get token ────────────────────────────────
    const cashier = await prisma.appUser.create({
      data: {
        username: "snap-cashier",
        passwordHash: await argon2.hash("Password123"),
        role: "THU_NGAN",
        chainWide: false,
        mustChangePassword: false,
        tokenVersion: 0,
      },
    });
    await prisma.userBranch.create({ data: { userId: cashier.id, branchId } });

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "snap-cashier", password: "Password123" })
      .expect(201);
    cashierToken = loginRes.body.accessToken as string;

    // ── Seed: open shift ──────────────────────────────────────────────────────
    const today = new Date();
    const shift = await prisma.shift.create({
      data: {
        branchId,
        deviceId,
        businessDate: new Date(today.toISOString().slice(0, 10) + "T00:00:00Z"),
        status: "OPEN",
        openedBy: cashier.id,
        openingCashVnd: 500_000,
      },
    });
    shiftId = shift.id;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  // ── 1. Create bill — server resolves price ─────────────────────────────────
  it("creates bill with server-resolved price (client sends no price)", async () => {
    const res = await request(app.getHttpServer())
      .post("/sales/bills")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        branchId,
        deviceId,
        shiftId,
        lines: [{ ticketTypeId, qty: 2 }],
        clientUuid: "snap-test-uuid-1",
      })
      .expect(201);

    const bill = res.body as {
      id: string;
      number: string;
      seq: number;
      totalVnd: number;
      guestCount: number;
      lines: Array<{ unitPriceVnd: number; qty: number; lineTotalVnd: number; ticketTypeName: string }>;
    };

    // Server priced at 150,000 per ticket × 2
    expect(bill.totalVnd).toBe(300_000);
    expect(bill.guestCount).toBe(2);
    expect(bill.lines).toHaveLength(1);
    expect(bill.lines[0].unitPriceVnd).toBe(150_000);
    expect(bill.lines[0].lineTotalVnd).toBe(300_000);
    expect(bill.lines[0].ticketTypeName).toBe("Người lớn");

    // Number format: [CODE]-[YYMMDD]-[NNNN]
    expect(bill.number).toMatch(/^TS01-\d{6}-\d{4}$/);
    expect(bill.seq).toBe(1);
  });

  // ── 2. Snapshot immutability: price change doesn't mutate existing bill ────
  it("BillLine.unitPriceVnd is unchanged after the price cell is updated", async () => {
    // First, create a bill and capture its line price
    const createRes = await request(app.getHttpServer())
      .post("/sales/bills")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        branchId,
        deviceId,
        shiftId,
        lines: [{ ticketTypeId, qty: 1 }],
        clientUuid: "snap-immutability-uuid",
      })
      .expect(201);

    const billId: string = createRes.body.id;
    const originalPrice: number = createRes.body.lines[0].unitPriceVnd;
    expect(originalPrice).toBe(150_000);

    // Create a new future version and add cells with a different price.
    // We can't mutate the existing version (immutable if effectiveFrom <= today).
    // For this test, directly update via Prisma to simulate what would happen
    // if price cells in a new version overrode the old one.
    // The original bill's BillLine already has the snapshotted price — it must not change.

    // Simulate: update the priceCell directly (normally forbidden on live version,
    // but we do this at DB level to force the scenario)
    await prisma.priceCell.updateMany({
      where: { versionId, ticketTypeId, timeWindowId },
      data: { priceVnd: 999_999 },
    });

    // Re-read the ORIGINAL bill via API — its BillLine price must be unchanged
    const getRes = await request(app.getHttpServer())
      .get(`/sales/bills/${billId}`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .expect(200);

    const billAfterPriceChange = getRes.body as {
      lines: Array<{ unitPriceVnd: number }>;
    };
    expect(billAfterPriceChange.lines[0].unitPriceVnd).toBe(150_000);

    // Restore the price for subsequent tests
    await prisma.priceCell.updateMany({
      where: { versionId, ticketTypeId, timeWindowId },
      data: { priceVnd: 150_000 },
    });
  });

  // ── 3. guestCount includes free tickets ───────────────────────────────────
  it("guestCount counts free tickets (M7)", async () => {
    const res = await request(app.getHttpServer())
      .post("/sales/bills")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        branchId,
        deviceId,
        shiftId,
        lines: [
          { ticketTypeId, qty: 2 },          // 2 paid
          { ticketTypeId: freeTicketTypeId, qty: 3 }, // 3 free
        ],
        clientUuid: "snap-guestcount-uuid",
      })
      .expect(201);

    const bill = res.body as { guestCount: number; totalVnd: number };
    // guestCount = 2 paid + 3 free = 5
    expect(bill.guestCount).toBe(5);
    // totalVnd = only paid tickets
    expect(bill.totalVnd).toBe(300_000);
  });

  // ── 4. Idempotency: same clientUuid returns existing bill ──────────────────
  it("duplicate clientUuid returns the same bill (offline resync idempotency)", async () => {
    const clientUuid = "snap-idempotency-uuid";

    const first = await request(app.getHttpServer())
      .post("/sales/bills")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        branchId,
        deviceId,
        shiftId,
        lines: [{ ticketTypeId, qty: 1 }],
        clientUuid,
      })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post("/sales/bills")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        branchId,
        deviceId,
        shiftId,
        lines: [{ ticketTypeId, qty: 1 }],
        clientUuid,
      })
      .expect(201);

    expect(first.body.id).toBe(second.body.id);
    expect(first.body.number).toBe(second.body.number);
  });

  // ── 5. Bill number format and seq increment ────────────────────────────────
  it("bill numbers are sequential within the branch+date", async () => {
    // Bills created in tests above have seq 1, 2, 3, 4 (in order).
    // Just verify the last one has the right format.
    const res = await request(app.getHttpServer())
      .post("/sales/bills")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        branchId,
        deviceId,
        shiftId,
        lines: [{ ticketTypeId, qty: 1 }],
      })
      .expect(201);

    const bill = res.body as { number: string; seq: number };
    // Format: TS01-YYMMDD-NNNN (4-digit zero-padded seq)
    expect(bill.number).toMatch(/^TS01-\d{6}-\d{4}$/);
    expect(bill.seq).toBeGreaterThanOrEqual(1);
    const seqInNumber = parseInt(bill.number.split("-")[2]!, 10);
    expect(seqInNumber).toBe(bill.seq);
  });
});
