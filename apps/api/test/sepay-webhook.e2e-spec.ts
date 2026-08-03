/**
 * Sepay webhook ingest (V0) — real Postgres via testcontainer + HTTP.
 *
 * Proves: the @Public webhook authenticates with `Authorization: Apikey <key>`
 * (fail-closed), stores inbound transfers idempotently, and ignores outgoing.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

const SCHEMA = join(__dirname, "..", "..", "..", "prisma", "schema.prisma");
const API_KEY = "sepay-test-key";

const payload = (over: Record<string, unknown> = {}) => ({
  id: 92704,
  gateway: "Vietcombank",
  transactionDate: "2026-08-03 14:02:37",
  accountNumber: "0123499999",
  content: "CN01 260803 0001 thanh toan",
  transferType: "in",
  transferAmount: 200_000,
  referenceCode: "MBVCB.123",
  ...over,
});

describe("Sepay webhook ingest (integration)", () => {
  let db: StartedTestDb;
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = "test-secret-sepay";
    process.env.JWT_REFRESH_SECRET = "test-refresh-sepay";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.SEPAY_API_KEY = API_KEY;
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  const post = (body: object, auth?: string) => {
    const r = request(app.getHttpServer()).post("/webhooks/sepay");
    if (auth !== undefined) r.set("Authorization", auth);
    return r.send(body);
  };

  it("rejects a call with no Authorization header", async () => {
    await post(payload()).expect(401);
  });

  it("rejects a wrong API key", async () => {
    await post(payload(), "Apikey wrong-key").expect(401);
  });

  it("stores an inbound transfer with the correct key", async () => {
    await post(payload({ id: 1001 }), `Apikey ${API_KEY}`).expect(200);
    const tx = await prisma.bankTransaction.findUnique({ where: { provider_providerTxId: { provider: "sepay", providerTxId: "1001" } } });
    expect(tx?.amountVnd).toBe(200_000);
    expect(tx?.status).toBe("UNMATCHED");
    expect(tx?.content).toContain("CN01");
  });

  it("ignores an outgoing transfer", async () => {
    await post(payload({ id: 1002, transferType: "out" }), `Apikey ${API_KEY}`).expect(200);
    const tx = await prisma.bankTransaction.findUnique({ where: { provider_providerTxId: { provider: "sepay", providerTxId: "1002" } } });
    expect(tx).toBeNull();
  });

  it("is idempotent on replay of the same transaction id", async () => {
    await post(payload({ id: 1003 }), `Apikey ${API_KEY}`).expect(200);
    await post(payload({ id: 1003 }), `Apikey ${API_KEY}`).expect(200);
    const rows = await prisma.bankTransaction.findMany({ where: { providerTxId: "1003" } });
    expect(rows).toHaveLength(1);
  });
});
