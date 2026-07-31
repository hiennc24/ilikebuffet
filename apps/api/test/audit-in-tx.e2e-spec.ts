import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { AuditExportService } from "../src/audit/audit-export.service";

/**
 * The audit log for a sensitive action lives or dies WITH that action:
 * a rolled-back business tx must leave no audit row; a committed one must leave
 * exactly one with the correct before/after. Plus a micro-benchmark of the
 * in-tx audit insert (Red Team C4/AD7 — measured at P2, not deferred to P7).
 */
describe("audit in-transaction semantics (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;
  let audit: AuditService;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    execFileSync(
      "npx",
      ["prisma", "migrate", "deploy", "--schema", join(__dirname, "..", "..", "..", "prisma", "schema.prisma")],
      { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" },
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    audit = app.get(AuditService);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it("rolled-back tx leaves NO audit row", async () => {
    const action = "test.rollback";
    await expect(
      prisma.withTx(async (tx) => {
        await audit.record(tx, { action, objectType: "bill", objectId: "b1" });
        throw new Error("business failure");
      }),
    ).rejects.toThrow("business failure");

    const rows = await prisma.auditLog.findMany({ where: { action } });
    expect(rows).toHaveLength(0);
  });

  it("committed tx leaves exactly ONE row with correct before/after", async () => {
    const action = "test.commit";
    await prisma.withTx(async (tx) => {
      await audit.record(tx, {
        action,
        objectType: "ticket_price",
        objectId: "tp1",
        actorId: "u1",
        branchId: "CN1",
        before: { price: 100_000 },
        after: { price: 150_000 },
        reason: "price update",
      });
    });

    const rows = await prisma.auditLog.findMany({ where: { action } });
    expect(rows).toHaveLength(1);
    expect(rows[0].before).toEqual({ price: 100_000 });
    expect(rows[0].after).toEqual({ price: 150_000 });
    expect(rows[0].branchId).toBe("CN1");
    expect(rows[0].reason).toBe("price update");
  });

  it("micro-benchmark: in-tx audit insert cost (C4/AD7)", async () => {
    const N = 50;
    const start = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      await prisma.withTx(async (tx) => {
        await audit.record(tx, { action: "bench.insert", objectType: "bill", objectId: `b${i}` });
      });
    }
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    const avgMs = elapsedMs / N;
    // Informational — printed so P7 has a number before building the bill hot path.
    // Generous ceiling only to catch a pathological regression, not to gate perf.
    // eslint-disable-next-line no-console
    console.log(`[audit-bench] ${N} in-tx audit inserts: ${elapsedMs.toFixed(1)}ms total, ${avgMs.toFixed(2)}ms/insert`);
    expect(avgMs).toBeLessThan(50);
  });

  it("WORM export streams rows after a cursor and is exhaustible", async () => {
    const exporter = app.get(AuditExportService);
    const first = await exporter.exportSince(null);
    expect(first.count).toBeGreaterThan(0);
    expect(first.lastId).not.toBeNull();
    // NDJSON: one parsable JSON object per line, id serialised as string.
    const lines = first.ndjson.split("\n");
    expect(lines).toHaveLength(first.count);
    expect(typeof JSON.parse(lines[0]).id).toBe("string");
    // Re-exporting from the last cursor yields nothing new.
    const next = await exporter.exportSince(BigInt(first.lastId as string));
    expect(next.count).toBe(0);
  });
});
