import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { startTestDb, StartedTestDb } from "@ilikebuffet/shared/test";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCHEMA = join(REPO_ROOT, "prisma", "schema.prisma");

export interface AuditHarness {
  db: StartedTestDb;
  /** Superuser client (testcontainers default role) — bypasses the trigger. */
  superuser: PrismaClient;
  /** URL for the app role: append+read only (UPDATE/DELETE revoked). */
  appUrl: string;
  /** URL for a NON-superuser role that KEEPS update/delete — only the trigger blocks it. */
  privilegedUrl: string;
  stop: () => Promise<void>;
}

function withCreds(url: string, user: string, password: string): string {
  const u = new URL(url);
  u.username = user;
  u.password = password;
  return u.toString();
}

/** Apply a SQL file as the superuser via the Prisma CLI. */
function applySqlFile(url: string, file: string): void {
  execFileSync("npx", ["prisma", "db", "execute", "--url", url, "--file", file], {
    env: { ...process.env },
    stdio: "inherit",
  });
}

/**
 * Boot a Postgres testcontainer with migrations + audit immutability guards +
 * two extra roles, so tests can prove append-only from every angle:
 *  - app role: UPDATE/DELETE revoked (privilege layer)
 *  - privileged non-superuser: keeps UPDATE/DELETE, blocked by trigger (insider layer)
 *  - superuser: escape hatch, may mutate (DR)
 */
export async function setupAuditHarness(): Promise<AuditHarness> {
  const db = await startTestDb();

  // 1. Schema via committed migrations.
  execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], {
    env: { ...process.env, DATABASE_URL: db.url },
    stdio: "inherit",
  });

  const superuser = new PrismaClient({ datasources: { db: { url: db.url } } });
  const dbName = new URL(db.url).pathname.replace(/^\//, "");

  // 2. Provision roles (superuser). audit_owner (NOLOGIN) will own the audit
  //    objects so no app/DBA role can drop or disable the trigger (C1).
  await superuser.$executeRawUnsafe(`CREATE ROLE audit_owner NOLOGIN`);
  await superuser.$executeRawUnsafe(`CREATE ROLE ilikebuffet_app LOGIN PASSWORD 'app' NOSUPERUSER`);
  await superuser.$executeRawUnsafe(`CREATE ROLE audit_privileged LOGIN PASSWORD 'priv' NOSUPERUSER`);
  for (const role of ["ilikebuffet_app", "audit_privileged"]) {
    await superuser.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${dbName}" TO ${role}`);
    await superuser.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
    // Includes TRUNCATE so the privileged role reaches the trigger (not a bare
    // privilege denial); the app role has UPDATE/DELETE/TRUNCATE revoked again
    // by audit-role-grants.sql.
    await superuser.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON audit_log TO ${role}`,
    );
    await superuser.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    );
    await superuser.$executeRawUnsafe(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
    );
  }

  // 3. Immutability trigger → owner segregation → REVOKE on the app role.
  applySqlFile(db.url, join(REPO_ROOT, "prisma", "sql", "audit-immutability.sql"));
  applySqlFile(db.url, join(REPO_ROOT, "prisma", "sql", "audit-ownership.sql"));
  applySqlFile(db.url, join(REPO_ROOT, "prisma", "sql", "audit-role-grants.sql"));

  return {
    db,
    superuser,
    appUrl: withCreds(db.url, "ilikebuffet_app", "app"),
    privilegedUrl: withCreds(db.url, "audit_privileged", "priv"),
    stop: async () => {
      await superuser.$disconnect();
      await db.stop();
    },
  };
}
