/**
 * SyncService — P8 offline bill sync (BH-05).
 *
 * Invariants (Red Team):
 *   C1 — branch/device in DTO must match the calling token; rejected → 403+audit.
 *   C2 — server recomputes all prices from line-items + createdAt; no client prices accepted.
 *   C5 — always returns full map {clientUuid → result} for every bill in request; no partial.
 *        per-bill idempotent: each bill gets its own tx; all-or-nothing is NOT the contract.
 *        never rejects a sale that was already committed.
 *   C8 — stores tempNumber on bill for audit/high-water-mark reconciliation.
 *
 * Each bill is processed independently. A failure on one does NOT block others.
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { PricingService } from "../pricing/pricing.service";
import { BillNumberService } from "./bill-number.service";
import { checkFreeTicketPolicy } from "./bill-policy";
import { toVnDateStr } from "@ilikebuffet/shared";
import type { SyncBillDto, SyncBillResult } from "./sync.dto";

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
   * success/failure so the batch always returns a full map (C5).
   *
   * @param dto              one bill from the batch
   * @param actorId          user id from JWT (used for createdBy + audit)
   * @param allowedBranchIds set of branchIds from the JWT (C1 authz check)
   */
  async processBill(
    dto: SyncBillDto,
    actorId: string,
    allowedBranchIds: Set<string>,
  ): Promise<SyncBillResult> {
    const base: Pick<SyncBillResult, "clientUuid" | "tempNumber"> = {
      clientUuid: dto.clientUuid,
      tempNumber: dto.tempNumber,
    };

    // C1: bill's branchId must be in the caller's allowed set
    if (!allowedBranchIds.has(dto.branchId)) {
      this.logger.warn(
        `Sync authz mismatch: dto.branchId=${dto.branchId} not in token branches`,
      );
      await this.recordRejectionAudit(dto, actorId, "authz_mismatch");
      return { ...base, status: "rejected", error: "branch not allowed by token" };
    }

    // C5: idempotent check — if already committed, return existing number immediately
    try {
      const existing = await this.prisma.bill.findUnique({
        where: { deviceId_clientUuid: { deviceId: dto.deviceId, clientUuid: dto.clientUuid } },
        select: { number: true, tempNumber: true },
      });
      if (existing) {
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

        // C2: server recomputes all prices — client lines have no price
        const createdAt = new Date(dto.createdAt);
        const businessDate = toVnDateStr(createdAt);

        const resolvedLines: Array<{
          ticketTypeId: string;
          ticketTypeName: string;
          unitPriceVnd: number;
          qty: number;
          lineTotalVnd: number;
          isFree: boolean;
          timeWindowId: string | null;
          timeWindowName: string | null;
          dayType: string | null;
          priceVersionId: string | null;
        }> = [];

        for (const lineDto of dto.lines) {
          const ticketType = await tx.ticketType.findUnique({
            where: { id: lineDto.ticketTypeId },
          });
          if (!ticketType) throw new Error(`TicketType ${lineDto.ticketTypeId} not found`);

          const priceResult = await this.pricing.resolvePrice({
            branchId: dto.branchId,
            ticketTypeId: lineDto.ticketTypeId,
            createdAt: dto.createdAt,
          });

          // Never reject a sale already printed (C5) — flag accounting instead
          const unitPriceVnd = priceResult.kind === "PRICE" ? priceResult.priceVnd : 0;

          let timeWindowName: string | null = null;
          if (priceResult.kind === "PRICE" && priceResult.timeWindowId) {
            const tw = await tx.timeWindow.findUnique({ where: { id: priceResult.timeWindowId } });
            timeWindowName = tw?.name ?? null;
          }

          resolvedLines.push({
            ticketTypeId: lineDto.ticketTypeId,
            ticketTypeName: ticketType.name,
            unitPriceVnd,
            qty: lineDto.qty,
            lineTotalVnd: unitPriceVnd * lineDto.qty,
            isFree: ticketType.isFree,
            timeWindowId: priceResult.kind === "PRICE" ? (priceResult.timeWindowId ?? null) : null,
            timeWindowName,
            dayType: priceResult.kind === "PRICE" ? (priceResult.dayType ?? null) : null,
            priceVersionId: priceResult.kind === "PRICE" ? (priceResult.versionId ?? null) : null,
          });
        }

        const violation = checkFreeTicketPolicy(resolvedLines);
        // C5: never reject a sale already printed — log flag instead of throwing
        if (violation) {
          this.logger.warn(`Free-ticket policy violation on offline sync: ${violation.message} clientUuid=${dto.clientUuid}`);
        }

        const guestCount = resolvedLines.reduce((sum, l) => sum + l.qty, 0);
        const totalVnd = resolvedLines.reduce((sum, l) => sum + l.lineTotalVnd, 0);

        // Allocate official gapless number (counter→audit lock order — C4)
        const { seq, number } = await this.billNumber.allocate(
          tx,
          branch.code,
          dto.branchId,
          businessDate,
        );

        // C8: store tempNumber alongside official number for audit/high-water-mark
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
          action: "bill.sync",
          objectType: "bill",
          objectId: bill.id,
          actorId,
          branchId: dto.branchId,
          after: {
            number,
            tempNumber: dto.tempNumber,
            clientUuid: dto.clientUuid,
            totalVnd,
            source: "offline_sync",
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
