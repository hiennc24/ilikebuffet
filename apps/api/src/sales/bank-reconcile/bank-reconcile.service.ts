/**
 * BankReconcileService — ingest Sepay bank-transfer webhooks (V0).
 *
 * Only inbound ("in") transfers are stored, idempotently per (provider,
 * providerTxId). The raw payload is kept for audit. Matching to a bill and
 * auto-applying a VIETQR payment is layered on in V1.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import type { SepayWebhookDto } from "./sepay-webhook.dto";

const PROVIDER = "sepay";

/** Parse Sepay's local "YYYY-MM-DD HH:mm:ss" (VN) into a Date. */
function parseSepayDate(s?: string): Date {
  if (!s) return new Date();
  const d = new Date(`${s.replace(" ", "T")}+07:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

@Injectable()
export class BankReconcileService {
  private readonly logger = new Logger(BankReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Store an inbound transfer; ignore outgoing; idempotent on replay. */
  async ingest(payload: SepayWebhookDto): Promise<{ success: boolean }> {
    if (payload.transferType !== "in") return { success: true };

    const providerTxId = String(payload.id);
    const existing = await this.prisma.bankTransaction.findUnique({
      where: { provider_providerTxId: { provider: PROVIDER, providerTxId } },
    });
    if (existing) return { success: true };

    try {
      await this.prisma.bankTransaction.create({
        data: {
          provider: PROVIDER,
          providerTxId,
          gateway: payload.gateway ?? null,
          accountNumber: payload.accountNumber ?? null,
          amountVnd: payload.transferAmount,
          content: payload.content,
          referenceCode: payload.referenceCode ?? null,
          transferredAt: parseSepayDate(payload.transactionDate),
          status: "UNMATCHED",
          rawPayload: payload as unknown as Prisma.InputJsonObject,
        },
      });
    } catch (e) {
      // Concurrent duplicate delivery races the findUnique → unique violation is
      // just another idempotent hit.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { success: true };
      }
      throw e;
    }

    this.logger.log(`Sepay tx ingested: id=${providerTxId} amount=${payload.transferAmount}`);
    return { success: true };
  }
}
