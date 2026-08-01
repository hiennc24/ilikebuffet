/**
 * SyncService — offline bill sync.
 *
 * Invariants:
 *   - Branch/device in DTO must match the calling token; rejected → 403+audit.
 *   - Server recomputes all prices from line-items + createdAt; no client prices accepted.
 *   - Always returns full map {clientUuid → result} for every bill in request; no partial.
 *     Per-bill idempotent: each bill gets its own tx; all-or-nothing is NOT the contract.
 *     Never rejects a sale that was already committed.
 *   - Stores tempNumber on bill for audit/high-water-mark reconciliation.
 *
 * Each bill is processed independently. A failure on one does NOT block others.
 */

import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { PricingService } from "../pricing/pricing.service";
import { BillNumberService } from "./bill-number.service";
import { checkFreeTicketPolicy } from "./bill-policy";
import { buildResolvedLines } from "./resolved-lines";
import { sumVnd, toVnDateStr } from "@ilikebuffet/shared";
import type { SyncBillDto, SyncBillResult, SyncVoidDto } from "./sync.dto";

/** Device-clock skew beyond this is accepted-but-quarantined (±2 min). */
const CLOCK_SKEW_TOLERANCE_MS = 2 * 60 * 1000;

/**
 * A device-set createdAt more than this far from server receipt is implausible
 * for an offline bill (which normally syncs within its shift/day) and is flagged
 * for reconciliation. The timestamp is still honored for the counter/date/price
 * (offline bills are legitimately created before they sync) — this is a flag,
 * not an override.
 */
const CREATED_AT_PLAUSIBILITY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pricing: PricingService,
    private readonly billNumber: BillNumberService,
  ) {}

  /**
   * Process a single offline bill. Returns a SyncBillResult regardless of
   * success/failure so the batch always returns a full map.
   *
   * @param dto              one bill from the batch
   * @param actorId          user id from JWT (used for createdBy + audit)
   * @param allowedBranchIds set of branchIds from the JWT (authz check)
   */
  async processBill(
    dto: SyncBillDto,
    actorId: string,
    allowedBranchIds: Set<string>,
    opts?: { forceQuarantine?: { reason: string; approvedBy: string }; tokenDeviceId?: string },
  ): Promise<SyncBillResult> {
    const base: Pick<SyncBillResult, "clientUuid" | "tempNumber"> = {
      clientUuid: dto.clientUuid,
      tempNumber: dto.tempNumber,
    };
    // Server receipt time — the authoritative clock used to sanity-check the
    // device-set createdAt before it drives the counter/business-date.
    const serverNow = new Date();

    // Branch authz: bill's branchId must be in the caller's allowed set
    if (!allowedBranchIds.has(dto.branchId)) {
      this.logger.warn(
        `Sync authz mismatch: dto.branchId=${dto.branchId} not in token branches`,
      );
      await this.recordRejectionAudit(dto, actorId, "authz_mismatch");
      return { ...base, status: "rejected", error: "branch not allowed by token" };
    }

    // Device binding: when the token is device-bound (PIN login), a device may only
    // sync its OWN bills — it cannot hijack or suppress another device's uuid.
    if (opts?.tokenDeviceId && dto.deviceId !== opts.tokenDeviceId) {
      this.logger.warn(`Sync device mismatch: dto.deviceId=${dto.deviceId} token=${opts.tokenDeviceId}`);
      await this.recordRejectionAudit(dto, actorId, "device_mismatch");
      return { ...base, status: "rejected", error: "device not allowed by token" };
    }

    // A non-integer / non-positive qty is corruption, not a legitimate printed
    // sale — reject it instead of committing a negative/NaN total. (The
    // never-reject rule protects real sales, not tampered/garbled payloads.)
    if (dto.lines.some((l) => !Number.isInteger(l.qty) || l.qty < 1)) {
      this.logger.warn(`Sync invalid qty: clientUuid=${dto.clientUuid}`);
      await this.recordRejectionAudit(dto, actorId, "invalid_qty");
      return { ...base, status: "rejected", error: "invalid_qty" };
    }

    const contentHash = computeContentHash(dto);

    // Idempotent check — if already committed, return existing number immediately.
    // A dedup hit whose stored content hash differs from the resubmitted bill
    // means the same (device, uuid) was reused for DIFFERENT content (tampering or
    // corruption). Offline bills are append-only, so this must never happen
    // legitimately — reject + audit instead of silently returning the number.
    try {
      const existing = await this.prisma.bill.findUnique({
        where: { deviceId_clientUuid: { deviceId: dto.deviceId, clientUuid: dto.clientUuid } },
        select: { number: true, contentHash: true },
      });
      if (existing) {
        if (existing.contentHash && existing.contentHash !== contentHash) {
          this.logger.warn(
            `Sync content mismatch: clientUuid=${dto.clientUuid} reused with different content`,
          );
          await this.recordRejectionAudit(dto, actorId, "content_mismatch");
          return { ...base, status: "rejected", error: "content_mismatch" };
        }
        this.logger.log(`Idempotent sync hit: clientUuid=${dto.clientUuid} number=${existing.number}`);
        return { ...base, status: "committed", officialNumber: existing.number };
      }
    } catch (err) {
      this.logger.error(`Idempotent check failed for ${dto.clientUuid}`, err);
      return { ...base, status: "retry", error: "db_lookup_failed" };
    }

    // Process in own transaction (per-bill idempotent, not all-or-nothing)
    try {
      const officialNumber = await this.prisma.withTx(async (tx) => {
        // Validate shift
        const shift = await tx.shift.findUnique({ where: { id: dto.shiftId } });
        if (!shift) throw new Error(`Shift ${dto.shiftId} not found`);
        if (shift.status !== "OPEN") throw new Error("Shift is not OPEN");
        if (shift.branchId !== dto.branchId) throw new Error("Shift/branch mismatch");

        const branch = await tx.branch.findUnique({ where: { id: dto.branchId } });
        if (!branch) throw new Error(`Branch ${dto.branchId} not found`);

        // Server recomputes all prices — client lines have no price.
        // Offline bills are created before they sync, so the device-set createdAt
        // is trusted to drive the gapless counter + business-date + price
        // (price-deciding timestamp = createdAt). We do NOT overwrite it, but a
        // createdAt implausibly far from server time (independent of the reported
        // clockOffsetMs) is flagged for reconciliation — see quarantine below.
        const createdAt = new Date(dto.createdAt);
        const businessDate = toVnDateStr(createdAt);
        const createdAtSkewMs = Math.abs(serverNow.getTime() - createdAt.getTime());
        const createdAtImplausible = createdAtSkewMs > CREATED_AT_PLAUSIBILITY_MS;

        // Batch-load ticket types + build the price resolver ONCE (HI-1) — the
        // whole batch shares this branch + createdAt. Offline sync never rejects
        // a printed sale on a missing price (accepts at 0, flags for accounting).
        const ticketTypes = await tx.ticketType.findMany({
          where: { id: { in: [...new Set(dto.lines.map((l) => l.ticketTypeId))] } },
        });
        const ticketTypeById = new Map(ticketTypes.map((t) => [t.id, t]));
        const resolver = await this.pricing.buildResolver(dto.branchId, createdAt);
        const resolvedLines = buildResolvedLines(dto.lines, ticketTypeById, resolver, {
          rejectOnNoPrice: false,
        });

        const violation = checkFreeTicketPolicy(resolvedLines);
        // Never reject a sale already printed — log flag instead of throwing
        if (violation) {
          this.logger.warn(`Free-ticket policy violation on offline sync: ${violation.message} clientUuid=${dto.clientUuid}`);
        }

        const guestCount = resolvedLines.reduce((sum, l) => sum + l.qty, 0);
        const totalVnd = sumVnd(resolvedLines.map((l) => l.lineTotalVnd));

        // Quarantine (accept-but-flag; never reject a printed sale):
        //  - a force-closed stuck bill is always quarantined with its reason.
        //  - a device clock drifted beyond tolerance (createdAt-derived
        //    price/date may be unreliable).
        //  - the createdAt is implausibly far from server time — its counter/date
        //    allocation is honored but flagged for reconciliation.
        const forced = opts?.forceQuarantine;
        const skewMs = Math.abs(dto.clockOffsetMs ?? 0);
        const skewExceeded = skewMs > CLOCK_SKEW_TOLERANCE_MS;
        // A payment total that doesn't match the SERVER-recomputed total means the
        // offline price estimate drifted from the authoritative price — accept but
        // quarantine for accounting (never reject a printed, paid sale).
        const paymentSum = (dto.payments ?? []).reduce((s, p) => s + p.amountVnd, 0);
        const paymentMismatch = (dto.payments?.length ?? 0) > 0 && paymentSum !== totalVnd;
        const quarantined = !!forced || skewExceeded || createdAtImplausible || paymentMismatch;
        const quarantineReason = forced
          ? forced.reason
          : skewExceeded
            ? `clock_skew_${Math.round(skewMs / 1000)}s_exceeds_${CLOCK_SKEW_TOLERANCE_MS / 1000}s`
            : createdAtImplausible
              ? `created_at_implausible_${Math.round(createdAtSkewMs / 1000)}s_from_server`
              : paymentMismatch
                ? `payment_mismatch_paid_${paymentSum}_vs_total_${totalVnd}`
                : null;

        // Allocate official gapless number (counter→audit lock order)
        const { seq, number } = await this.billNumber.allocate(
          tx,
          branch.code,
          dto.branchId,
          businessDate,
        );

        // Store tempNumber alongside official number for audit/high-water-mark
        const bill = await tx.bill.create({
          data: {
            number,
            seq,
            branchId: dto.branchId,
            shiftId: dto.shiftId,
            deviceId: dto.deviceId,
            businessDate: new Date(`${businessDate}T00:00:00Z`),
            status: "COMPLETED",
            createdBy: actorId,
            createdAt,
            totalVnd,
            guestCount,
            clientUuid: dto.clientUuid,
            tempNumber: dto.tempNumber,
            contentHash,
            deviceClockAt: dto.deviceClockAt ? new Date(dto.deviceClockAt) : null,
            clockOffsetMs: dto.clockOffsetMs ?? null,
            quarantined,
            quarantineReason,
            // Offline bills carry their payment; the sale was settled at creation.
            paidAt: dto.payments?.length ? createdAt : null,
            payments: dto.payments?.length
              ? {
                  create: dto.payments.map((p) => ({
                    method: p.method,
                    amountVnd: p.amountVnd,
                    tenderedVnd: p.tenderedVnd ?? null,
                    changeVnd:
                      p.tenderedVnd !== undefined ? p.tenderedVnd - p.amountVnd : null,
                    reference: p.reference ?? null,
                  })),
                }
              : undefined,
            lines: {
              create: resolvedLines.map((l) => ({
                ticketTypeId: l.ticketTypeId,
                ticketTypeName: l.ticketTypeName,
                unitPriceVnd: l.unitPriceVnd,
                qty: l.qty,
                lineTotalVnd: l.lineTotalVnd,
                isFree: l.isFree,
                timeWindowId: l.timeWindowId,
                timeWindowName: l.timeWindowName,
                dayType: l.dayType,
                priceVersionId: l.priceVersionId,
              })),
            },
          },
        });

        await this.audit.record(tx, {
          action: forced ? "bill.force_close" : "bill.sync",
          objectType: "bill",
          objectId: bill.id,
          actorId,
          branchId: dto.branchId,
          approvedBy: forced?.approvedBy ?? null,
          reason: forced?.reason ?? null,
          after: {
            number,
            tempNumber: dto.tempNumber,
            clientUuid: dto.clientUuid,
            totalVnd,
            source: forced ? "force_close_stuck" : "offline_sync",
            quarantined,
            quarantineReason,
          },
        });

        return number;
      });

      return { ...base, status: "committed", officialNumber };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sync bill failed clientUuid=${dto.clientUuid}: ${message}`);
      return { ...base, status: "retry", error: message };
    }
  }

  /**
   * Record a draft that was voided on-device before it ever synced. No bill
   * row exists; we append an audit event so reconciliation can tell an
   * intentional void from a suppressed/lost bill (a hole below the shift HWM).
   * Returns true if recorded, false if the branch isn't allowed by the token.
   */
  async recordVoid(dto: SyncVoidDto, actorId: string, allowedBranchIds: Set<string>): Promise<boolean> {
    if (!allowedBranchIds.has(dto.branchId)) return false;
    await this.audit.record(this.prisma, {
      action: "bill.void_before_sync",
      objectType: "bill",
      objectId: dto.clientUuid ?? dto.tempNumber,
      actorId,
      branchId: dto.branchId,
      deviceId: dto.deviceId,
      reason: dto.reason ?? null,
      after: { tempNumber: dto.tempNumber, clientUuid: dto.clientUuid, reason: dto.reason },
    });
    return true;
  }

  private async recordRejectionAudit(dto: SyncBillDto, actorId: string, reason: string) {
    try {
      await this.audit.record(this.prisma, {
        action: "bill.sync_rejected",
        objectType: "bill",
        objectId: dto.clientUuid,
        actorId,
        branchId: dto.branchId,
        after: { clientUuid: dto.clientUuid, tempNumber: dto.tempNumber, reason },
      });
    } catch {
      // Audit failure must not block response
    }
  }
}

/**
 * Canonical SHA-256 of an offline bill's semantic content. Stable across
 * resubmits of the same append-only bill; changes only if the lines, quantities,
 * shift, or createdAt change. branchId/deviceId are excluded — they form the
 * dedup key, not the content.
 */
function computeContentHash(dto: SyncBillDto): string {
  const lines = [...dto.lines]
    .map((l) => ({ ticketTypeId: l.ticketTypeId, qty: l.qty }))
    .sort((a, b) => (a.ticketTypeId < b.ticketTypeId ? -1 : a.ticketTypeId > b.ticketTypeId ? 1 : 0));
  const canonical = JSON.stringify({ shiftId: dto.shiftId, createdAt: dto.createdAt, lines });
  return createHash("sha256").update(canonical).digest("hex");
}
