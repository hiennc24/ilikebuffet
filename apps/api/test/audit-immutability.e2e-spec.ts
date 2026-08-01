import { PrismaClient } from "@prisma/client";
import { AuditHarness, setupAuditHarness } from "./audit-test-harness";

/**
 * audit_log is append-only against everyone but a superuser.
 *  - app role: UPDATE/DELETE revoked (privilege layer)
 *  - privileged non-superuser: keeps the privilege, blocked by the trigger
 *  - superuser: escape hatch for DR
 */
describe("audit_log immutability (integration)", () => {
  let h: AuditHarness;
  let appClient: PrismaClient;
  let privilegedClient: PrismaClient;
  let seedId: bigint;

  beforeAll(async () => {
    h = await setupAuditHarness();
    appClient = new PrismaClient({ datasources: { db: { url: h.appUrl } } });
    privilegedClient = new PrismaClient({ datasources: { db: { url: h.privilegedUrl } } });

    const seed = await h.superuser.auditLog.create({
      data: { action: "seed", objectType: "test" },
    });
    seedId = seed.id;
  }, 180_000);

  afterAll(async () => {
    await appClient?.$disconnect();
    await privilegedClient?.$disconnect();
    await h?.stop();
  });

  it("app role CAN append and read", async () => {
    const row = await appClient.auditLog.create({
      data: { action: "auth.login_failed", objectType: "session", actorId: "u1" },
    });
    expect(row.id).toBeDefined();
    const found = await appClient.auditLog.findMany({ where: { action: "auth.login_failed" } });
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it("app role CANNOT update (privilege revoked)", async () => {
    await expect(
      appClient.$executeRawUnsafe(`UPDATE audit_log SET reason = 'tamper' WHERE id = ${seedId}`),
    ).rejects.toThrow(/permission denied|append-only/i);
  });

  it("app role CANNOT delete (privilege revoked)", async () => {
    await expect(
      appClient.$executeRawUnsafe(`DELETE FROM audit_log WHERE id = ${seedId}`),
    ).rejects.toThrow(/permission denied|append-only/i);
  });

  it("privileged non-superuser is blocked by the trigger (insider/owner)", async () => {
    // This role HAS UPDATE/DELETE granted — only the trigger stops it.
    await expect(
      privilegedClient.$executeRawUnsafe(`UPDATE audit_log SET reason = 'tamper' WHERE id = ${seedId}`),
    ).rejects.toThrow(/append-only/i);
    await expect(
      privilegedClient.$executeRawUnsafe(`DELETE FROM audit_log WHERE id = ${seedId}`),
    ).rejects.toThrow(/append-only/i);
    await expect(
      privilegedClient.$executeRawUnsafe(`TRUNCATE audit_log`),
    ).rejects.toThrow(/append-only/i);
  });

  it("superuser retains the escape hatch (DR)", async () => {
    await expect(
      h.superuser.$executeRawUnsafe(`UPDATE audit_log SET reason = 'dr-fix' WHERE id = ${seedId}`),
    ).resolves.toBeDefined();
  });

  it("non-owner cannot DROP or DISABLE the trigger (owner segregation)", async () => {
    // audit_privileged has table DML privileges but does NOT own audit_log
    // (audit_owner does), so it cannot remove or disable the guard.
    await expect(
      privilegedClient.$executeRawUnsafe(`DROP TRIGGER audit_log_no_row_mutation ON audit_log`),
    ).rejects.toThrow(/must be owner|permission denied/i);
    await expect(
      privilegedClient.$executeRawUnsafe(`ALTER TABLE audit_log DISABLE TRIGGER ALL`),
    ).rejects.toThrow(/must be owner|permission denied/i);
  });
});
