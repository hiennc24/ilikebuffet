import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

/** A Prisma transaction-scoped client (what `$transaction(fn)` hands you). */
export type TxClient = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // The app runtime must connect as the NON-owner `ilikebuffet_app` role so
    // the audit-log REVOKE layer applies (an owner-class connection bypasses it,
    // Red Team H1). Migrations/tooling use DATABASE_URL (owner); the running app
    // sets APP_DATABASE_URL. Falls back to the default (DATABASE_URL) for tests.
    super(
      process.env.APP_DATABASE_URL
        ? { datasources: { db: { url: process.env.APP_DATABASE_URL } } }
        : undefined,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Prisma connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Run `fn` inside a single database transaction.
   *
   * This is the one sanctioned entry point for multi-statement atomic work
   * (bill numbering, audit writes). Hot paths that need row locks issue
   * `SELECT ... FOR UPDATE` via `$queryRaw` on the `tx` handle — see
   * {@link lockRowForUpdate}. Keep the locked section SHORT and lock in a
   * fixed order (counter -> audit) to avoid deadlocks (Red Team C4).
   */
  withTx<T>(
    fn: (tx: TxClient) => Promise<T>,
    options?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    return this.$transaction(fn, options);
  }
}

/**
 * Acquire a row lock with `SELECT ... FOR UPDATE` inside an open transaction.
 *
 * Demonstrates (and centralises) the raw-SQL escape hatch the hot path relies
 * on. Parameterised to avoid SQL injection; table/column are fixed literals.
 */
export async function lockRowForUpdate(
  tx: TxClient,
  label: string,
): Promise<Array<{ id: number; label: string }>> {
  return tx.$queryRaw<Array<{ id: number; label: string }>>`
    SELECT id, label FROM _health_probe WHERE label = ${label} FOR UPDATE
  `;
}
