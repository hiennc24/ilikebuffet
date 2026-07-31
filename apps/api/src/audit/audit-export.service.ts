import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditExportResult {
  count: number;
  /** Highest audit_log id included (string form of BigInt), or null if none. */
  lastId: string | null;
  /** Newline-delimited JSON, one audit row per line, ascending by id. */
  ndjson: string;
}

/**
 * GA-01 / Red Team H1: periodically export the audit trail append-only to
 * off-box WORM storage (e.g. S3 with Object Lock). Even a superuser DELETE at
 * the primary DB then stays detectable, because the off-box copy is immutable.
 *
 * This service produces the export PAYLOAD since a cursor (the hard part, and
 * the part worth testing). Delivery to object-lock storage is deploy config;
 * `writeToDir` provides a local append-only sink for dev / on-box staging.
 */
@Injectable()
export class AuditExportService {
  private readonly logger = new Logger(AuditExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Collect audit rows with id > afterId (exclusive), ascending, as NDJSON. */
  async exportSince(afterId: bigint | null, batchSize = 5000): Promise<AuditExportResult> {
    const rows = await this.prisma.auditLog.findMany({
      where: afterId === null ? undefined : { id: { gt: afterId } },
      orderBy: { id: "asc" },
      take: batchSize,
    });

    const ndjson = rows
      .map((r) => JSON.stringify({ ...r, id: r.id.toString() }))
      .join("\n");

    return {
      count: rows.length,
      lastId: rows.length ? rows[rows.length - 1].id.toString() : null,
      ndjson,
    };
  }

  /**
   * Append an export batch to a dated file under `dir` (local/on-box staging).
   * Production ships these to object-lock storage; appending only ever adds.
   */
  async writeToDir(dir: string, result: AuditExportResult, dayStamp: string): Promise<void> {
    if (result.count === 0) return;
    await mkdir(dir, { recursive: true });
    const file = join(dir, `audit-${dayStamp}.ndjson`);
    await appendFile(file, result.ndjson + "\n", "utf8");
    this.logger.log(`Exported ${result.count} audit rows to ${file} (lastId=${result.lastId})`);
  }
}
