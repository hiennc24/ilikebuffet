import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { PrismaService } from "../src/prisma/prisma.service";
import { BillNumberService } from "../src/sales/bills/bill-number.service";

/**
 * Bill numbering is landmine #1: under concurrency the issued numbers must be a
 * contiguous 1..N range with no duplicate and no gap, and a rolled-back
 * transaction must NOT burn a number. These properties only reproduce against a
 * real Postgres (FOR UPDATE / row-lock serialization), so this runs on a fresh
 * testcontainer — never SQLite, never a shared/reused DB (Red Team AD7).
 */
describe("bill numbering — concurrency + gaplessness (integration)", () => {
  let db: StartedTestDb;
  let prisma: PrismaService;
  let svc: BillNumberService;

  const CODE = "CN01";
  const BRANCH = "branch-under-test";

  beforeAll(async () => {
    db = await startTestDb();
    // PrismaService reads APP_DATABASE_URL || DATABASE_URL; force the ephemeral DB.
    delete process.env.APP_DATABASE_URL;
    process.env.DATABASE_URL = db.url;
    execFileSync(
      "npx",
      ["prisma", "migrate", "deploy", "--schema", join(__dirname, "..", "..", "..", "prisma", "schema.prisma")],
      { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" },
    );
    prisma = new PrismaService();
    await prisma.$connect();
    svc = new BillNumberService();
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it("N concurrent allocations → contiguous 1..N, no dup, no gap", async () => {
    const N = 50;
    const date = "2026-08-01";

    const results = await Promise.all(
      Array.from({ length: N }, () =>
        prisma.withTx((tx) => svc.allocate(tx, CODE, BRANCH, date)),
      ),
    );

    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
    // No duplicates.
    expect(new Set(seqs).size).toBe(N);
    // Contiguous 1..N.
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    // Numbers formatted [CODE]-[YYMMDD]-[NNNN], zero-padded.
    const byNumber = results.find((r) => r.seq === 7)!;
    expect(byNumber.number).toBe("CN01-260801-0007");

    // Counter row reflects the high-water mark.
    const counter = await prisma.billCounter.findUnique({
      where: { branchId_businessDate: { branchId: BRANCH, businessDate: new Date(`${date}T00:00:00Z`) } },
    });
    expect(counter?.lastNo).toBe(N);
  });

  it("a rolled-back allocation does NOT burn a number (gapless)", async () => {
    const date = "2026-08-02";

    // Allocate 3 numbers that commit.
    for (let i = 0; i < 3; i++) {
      await prisma.withTx((tx) => svc.allocate(tx, CODE, BRANCH, date));
    }

    // Allocate a 4th inside a tx that then throws — must roll back the increment.
    let rolledBackSeq = 0;
    await expect(
      prisma.withTx(async (tx) => {
        const a = await svc.allocate(tx, CODE, BRANCH, date);
        rolledBackSeq = a.seq;
        throw new Error("simulated business failure after allocate");
      }),
    ).rejects.toThrow("simulated business failure");
    expect(rolledBackSeq).toBe(4);

    // The next successful allocation REUSES seq 4 — no hole from the rollback.
    const next = await prisma.withTx((tx) => svc.allocate(tx, CODE, BRANCH, date));
    expect(next.seq).toBe(4);
    expect(next.number).toBe("CN01-260802-0004");
  });

  it("each (branch, business date) has its own independent range", async () => {
    const a = await prisma.withTx((tx) => svc.allocate(tx, CODE, BRANCH, "2026-09-15"));
    const b = await prisma.withTx((tx) => svc.allocate(tx, CODE, "other-branch", "2026-09-15"));
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(1);
    expect(a.number).toBe("CN01-260915-0001");
  });
});
