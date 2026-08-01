import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { SyncService } from "../src/sales/bills/sync.service";

/**
 * Acceptance scenarios for offline sync, against a real Postgres.
 * These are the "done gate" — they must hold with NO duplicate
 * and NO gap in numbers under every offline condition:
 *   (b) two devices offline for the same branch/date → distinct gapless numbers
 *   (c) flapping network resends the same bill → idempotent, one number
 *   (e) bills across midnight → independent per-date ranges, date from createdAt
 *   (f) a price book that becomes effective later → offline bill created after
 *       that instant is repriced to the new version (server recompute parity)
 */
describe("offline sync — acceptance scenarios (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;
  let sync: SyncService;

  const BRANCH = "b-scenario";
  const CODE = "CN01";
  const TT = "tt-adult";
  const TW = "tw-allday";
  const SHIFT = "shift-scenario";
  const ALLOWED = new Set([BRANCH]);
  const ACTOR = "cashier-scenario";

  beforeAll(async () => {
    db = await startTestDb();
    delete process.env.APP_DATABASE_URL;
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-sync";
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "test-jwt-refresh-sync";
    process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
    execFileSync(
      "npx",
      ["prisma", "migrate", "deploy", "--schema", join(__dirname, "..", "..", "..", "prisma", "schema.prisma")],
      { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" },
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    sync = app.get(SyncService);

    // Seed catalog + a current price book + an open shift.
    await prisma.branch.create({
      data: { id: BRANCH, code: CODE, name: "CN Scenario", address: "x", phone: "0", status: "ACTIVE" },
    });
    await prisma.ticketType.create({
      data: { id: TT, name: "Người lớn", color: "#000", displayOrder: 1, isFree: false, status: "ACTIVE" },
    });
    await prisma.timeWindow.create({ data: { id: TW, name: "Cả ngày", startMinute: 0, endMinute: 1440 } });
    // Current version effective in the past.
    const vCur = await prisma.priceBookVersion.create({
      data: { name: "current", effectiveFrom: new Date("2026-07-01"), branchId: null, createdBy: "seed" },
    });
    for (const dt of ["REGULAR", "WEEKEND", "HOLIDAY"]) {
      await prisma.priceCell.create({
        data: { versionId: vCur.id, ticketTypeId: TT, timeWindowId: TW, dayType: dt, priceVnd: 200000, branchId: null },
      });
    }
    // Future version effective 2026-08-10 with a higher price (scenario f).
    const vFut = await prisma.priceBookVersion.create({
      data: { name: "future", effectiveFrom: new Date("2026-08-10"), branchId: null, createdBy: "seed" },
    });
    for (const dt of ["REGULAR", "WEEKEND", "HOLIDAY"]) {
      await prisma.priceCell.create({
        data: { versionId: vFut.id, ticketTypeId: TT, timeWindowId: TW, dayType: dt, priceVnd: 250000, branchId: null },
      });
    }
    await prisma.shift.create({
      data: {
        id: SHIFT, branchId: BRANCH, deviceId: "seed-device", businessDate: new Date("2026-08-01"),
        status: "OPEN", openedBy: ACTOR, openingCashVnd: 0,
      },
    });
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  function bill(over: Partial<Parameters<SyncService["processBill"]>[0]> = {}) {
    return {
      clientUuid: "uuid-" + Math.round(Math.abs(Math.sin(Number(over.tempNumber?.length ?? 1))) * 1e9),
      tempNumber: "CN01-260801-TDEV001",
      branchId: BRANCH,
      shiftId: SHIFT,
      deviceId: "dev-A",
      createdAt: "2026-08-01T13:00:00+07:00",
      lines: [{ ticketTypeId: TT, qty: 1 }],
      ...over,
    };
  }

  it("(b) two devices offline, same branch/date → distinct gapless numbers", async () => {
    const a = await sync.processBill(bill({ clientUuid: "b-A", deviceId: "dev-A" }), ACTOR, ALLOWED);
    const b = await sync.processBill(bill({ clientUuid: "b-B", deviceId: "dev-B" }), ACTOR, ALLOWED);
    expect(a.status).toBe("committed");
    expect(b.status).toBe("committed");
    expect(a.officialNumber).not.toBe(b.officialNumber);
    // Contiguous within the same (branch, date) range.
    const seqs = [a.officialNumber, b.officialNumber].map((n) => Number(n!.split("-")[2])).sort((x, y) => x - y);
    expect(seqs[1] - seqs[0]).toBe(1);
  });

  it("(c) flapping network resends the same bill → idempotent, one number", async () => {
    const dto = bill({ clientUuid: "c-flap", deviceId: "dev-A" });
    const first = await sync.processBill(dto, ACTOR, ALLOWED);
    const resend1 = await sync.processBill(dto, ACTOR, ALLOWED);
    const resend2 = await sync.processBill(dto, ACTOR, ALLOWED);
    expect(first.status).toBe("committed");
    expect(resend1.officialNumber).toBe(first.officialNumber);
    expect(resend2.officialNumber).toBe(first.officialNumber);
    const count = await prisma.bill.count({ where: { deviceId: "dev-A", clientUuid: "c-flap" } });
    expect(count).toBe(1);
  });

  it("(e) bills across midnight → independent per-date ranges, date from createdAt", async () => {
    const d1 = await sync.processBill(
      bill({ clientUuid: "e-d1", deviceId: "dev-E", createdAt: "2026-08-03T23:50:00+07:00" }),
      ACTOR, ALLOWED,
    );
    const d2 = await sync.processBill(
      bill({ clientUuid: "e-d2", deviceId: "dev-E", createdAt: "2026-08-04T00:10:00+07:00" }),
      ACTOR, ALLOWED,
    );
    expect(d1.officialNumber).toContain("-260803-");
    expect(d2.officialNumber).toContain("-260804-");
    // Each date's range starts fresh at 0001.
    expect(d2.officialNumber!.endsWith("0001")).toBe(true);
    const b2 = await prisma.bill.findFirst({ where: { deviceId: "dev-E", clientUuid: "e-d2" } });
    expect(b2?.businessDate.toISOString().slice(0, 10)).toBe("2026-08-04");
  });

  it("(f) offline bill created after a future price book's effective date is repriced", async () => {
    const res = await sync.processBill(
      bill({ clientUuid: "f-future", deviceId: "dev-F", createdAt: "2026-08-11T12:00:00+07:00" }),
      ACTOR, ALLOWED,
    );
    expect(res.status).toBe("committed");
    const line = await prisma.billLine.findFirst({
      where: { bill: { deviceId: "dev-F", clientUuid: "f-future" } },
    });
    // Uses the future version's price (250000), not the current 200000.
    expect(line?.unitPriceVnd).toBe(250000);
  });
});
