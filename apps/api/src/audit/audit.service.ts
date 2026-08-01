import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** One audit event. `before`/`after` are arbitrary JSON snapshots (see captureBeforeAfter). */
export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  branchId?: string | null;
  deviceId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  approvedBy?: string | null;
}

/** Filters for the audit lookup. */
export interface AuditQuery {
  actorId?: string;
  action?: string;
  objectType?: string;
  objectId?: string;
  branchId?: string;
  /** Restrict to these branches (branch-scoping for non-chain-wide callers). */
  branchIds?: string[];
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

/** An audit row shaped for transport (BigInt id → string). */
export interface AuditRecordView {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  branchId: string | null;
  deviceId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  approvedBy: string | null;
  createdAt: Date;
}

/** A client that can write audit_log — either the base client or a tx client. */
export type AuditWriter = Prisma.TransactionClient | PrismaService;

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  // null/undefined snapshot → SQL NULL column, not JSON `null`.
  return value === undefined || value === null
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue);
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append one audit row.
   *
   * Pass the SURROUNDING business transaction's client (`tx`) for sensitive
   * actions so the log and the change live-or-die together (rollback leaves no
   * row; commit guarantees the row). For non-transactional events (reads,
   * login failures) pass the base PrismaService.
   *
   * Lock ordering when used inside the bill hot path is fixed counter → audit
   * (never reversed) to avoid AB/BA deadlocks.
   */
  async record(client: AuditWriter, entry: AuditEntry): Promise<void> {
    await client.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        objectType: entry.objectType,
        objectId: entry.objectId ?? null,
        branchId: entry.branchId ?? null,
        deviceId: entry.deviceId ?? null,
        before: toJsonInput(entry.before),
        after: toJsonInput(entry.after),
        reason: entry.reason ?? null,
        approvedBy: entry.approvedBy ?? null,
      },
    });
  }

  /** Filtered lookup across configured dimensions, newest first, with a total. */
  async query(filter: AuditQuery): Promise<{ data: AuditRecordView[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {
      actorId: filter.actorId,
      action: filter.action,
      objectType: filter.objectType,
      objectId: filter.objectId,
      // A branchIds allow-list (branch-scoping) wins; else an optional exact filter.
      ...(filter.branchIds ? { branchId: { in: filter.branchIds } } : { branchId: filter.branchId }),
    };
    if (filter.from || filter.to) {
      where.createdAt = { gte: filter.from, lte: filter.to };
    }

    const take = Math.min(filter.limit ?? 100, 1000);
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip: filter.offset ?? 0,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data = rows.map((r) => ({
      id: r.id.toString(),
      actorId: r.actorId,
      actorRole: r.actorRole,
      action: r.action,
      objectType: r.objectType,
      objectId: r.objectId,
      branchId: r.branchId,
      deviceId: r.deviceId,
      before: r.before,
      after: r.after,
      reason: r.reason,
      approvedBy: r.approvedBy,
      createdAt: r.createdAt,
    }));
    return { data, total };
  }
}
