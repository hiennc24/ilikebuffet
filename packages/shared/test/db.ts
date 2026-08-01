import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";

/**
 * Real Postgres for integration tests — never SQLite.
 *
 * Lock/tx semantics (FOR UPDATE, advisory locks, serializable conflicts) that
 * the bill-numbering hot path depends on differ between engines; testing on
 * SQLite would hide exactly the bugs we most need to catch.
 *
 * Image is pinned to match docker-compose / CI so behaviour is reproducible.
 */
const POSTGRES_IMAGE = "postgres:16.4";

export interface StartedTestDb {
  /** Prisma-compatible connection URL for the ephemeral database. */
  url: string;
  container: StartedPostgreSqlContainer;
  stop: () => Promise<void>;
}

/**
 * Start an isolated Postgres container for a test run.
 *
 * NOTE: concurrency tests (bill numbering) must NOT rely on a
 * shared reused container with leftover rows — each such suite should create its
 * own schema or wrap work in a rolled-back transaction so prior test rows can't
 * fake a gapless result. This bootstrap gives one clean DB per call by default.
 */
export async function startTestDb(): Promise<StartedTestDb> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase("ilikebuffet_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const url = container.getConnectionUri();
  return {
    url,
    container,
    stop: async () => {
      await container.stop();
    },
  };
}
