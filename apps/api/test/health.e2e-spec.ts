import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { AppModule } from "../src/app.module";
import { PrismaService, lockRowForUpdate } from "../src/prisma/prisma.service";

/**
 * Integration test against a REAL Postgres (testcontainers). Proves:
 *  1. /health returns 200 with a live DB round-trip.
 *  2. `withTx` + `SELECT ... FOR UPDATE` actually take a row lock.
 * No mocks, no SQLite — the lock semantics we test only exist on Postgres.
 */
describe("Health + DB harness (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;

    // Apply committed MIGRATIONS to the fresh container (not `db push`) so the
    // real migration path is exercised end-to-end every test run.
    const repoRoot = join(__dirname, "..", "..", "..");
    execFileSync(
      "npx",
      ["prisma", "migrate", "deploy", "--schema", join(repoRoot, "prisma", "schema.prisma")],
      { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" },
    );

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

  it("GET /health returns 200 with db up", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("up");
    expect(typeof res.body.timestamp).toBe("string");
  });

  it("SELECT ... FOR UPDATE holds a real row lock (NOWAIT proves contention)", async () => {
    await prisma.healthProbe.upsert({
      where: { label: "lock-demo" },
      create: { label: "lock-demo" },
      update: {},
    });

    // The contending query MUST run on a separate connection, otherwise the
    // result depends on the pool size (with connection_limit=1 it would block
    // on the pool, not on the row lock). A dedicated client makes the test
    // prove cross-connection row contention regardless of pool sizing.
    const contender = new PrismaClient({ datasources: { db: { url: db.url } } });
    try {
      await prisma.withTx(async (txA) => {
        // Transaction A takes the lock and holds it for the block's duration.
        const locked = await lockRowForUpdate(txA, "lock-demo");
        expect(locked).toHaveLength(1);

        // Another connection cannot grab the same row: NOWAIT raises 55P03
        // ("could not obtain lock"). Assert the specific error so an unrelated
        // failure (e.g. a connection timeout) can't masquerade as success.
        await expect(
          contender.$queryRaw`SELECT id FROM _health_probe WHERE label = ${"lock-demo"} FOR UPDATE NOWAIT`,
        ).rejects.toThrow(/could not obtain lock|55P03/i);
      });

      // After A commits, the lock is released and the row is grabbable again.
      const afterRelease = await contender.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM _health_probe WHERE label = ${"lock-demo"} FOR UPDATE NOWAIT
      `;
      expect(afterRelease).toHaveLength(1);
    } finally {
      await contender.$disconnect();
    }
  });
});
