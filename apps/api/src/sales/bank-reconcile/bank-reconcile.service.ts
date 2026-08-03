/**
 * BankReconcileService — ingest Sepay bank-transfer webhooks, match them to an
 * unpaid bill, and auto-confirm a VIETQR payment.
 *
 * Inbound ("in") transfers are stored idempotently per (provider, providerTxId).
 * A transfer auto-matches when EXACTLY one unpaid COMPLETED bill has the same
 * total and its (normalised) number appears in the transfer content; that bill is
 * paid and the transaction marked MATCHED. Zero or ambiguous matches stay
 * UNMATCHED for manual review. Every apply re-reads the bill inside the tx so a
 * concurrent manual payment can't be doubled.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService, TxClient } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { assertBranchAccess, type BranchAccess } from "../../platform/rbac/branch-access";
import type { SepayWebhookDto } from "./sepay-webhook.dto";

const PROVIDER = "sepay";
const SYSTEM_ACTOR = "system:sepay";

/** Uppercase and drop every non-alphanumeric char (bill number ↔ transfer memo). */
const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Parse Sepay's local "YYYY-MM-DD HH:mm:ss" (VN) into a Date. */
function parseSepayDate(s?: string): Date {
  if (!s) return new Date();
  const d = new Date(`${s.replace(" ", "T")}+07:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

type BankTx = Prisma.BankTransactionGetPayload<object>;

@Injectable()
export class BankReconcileService {
  private readonly logger = new Logger(BankReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Store an inbound transfer (idempotent), then attempt an auto-match. */
  async ingest(payload: SepayWebhookDto): Promise<{ success: boolean }> {
    if (payload.transferType !== "in") return { success: true };

    const providerTxId = String(payload.id);
    const existing = await this.prisma.bankTransaction.findUnique({
      where: { provider_providerTxId: { provider: PROVIDER, providerTxId } },
    });
    if (existing) return { success: true };

    try {
      await this.prisma.withTx(async (tx) => {
        const bankTx = await tx.bankTransaction.create({
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
        await this.tryAutoMatch(tx, bankTx);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { success: true }; // concurrent duplicate delivery
      }
      throw e;
    }

    this.logger.log(`Sepay tx ingested: id=${providerTxId} amount=${payload.transferAmount}`);
    return { success: true };
  }

  /** Auto-apply iff exactly one unpaid bill matches amount + number-in-content. */
  private async tryAutoMatch(tx: TxClient, bankTx: BankTx): Promise<void> {
    const candidates = await tx.bill.findMany({
      where: { status: "COMPLETED", paidAt: null, totalVnd: bankTx.amountVnd },
      select: { id: true, number: true, branchId: true, totalVnd: true },
    });
    const memo = normalize(bankTx.content);
    const matches = candidates.filter((b) => memo.includes(normalize(b.number)));
    if (matches.length !== 1) return; // none or ambiguous → manual review

    await this.applyPayment(tx, matches[0].id, bankTx, SYSTEM_ACTOR, "sepay-auto");
  }

  /**
   * Pay `billId` from `bankTx` and mark the transaction MATCHED, all in `tx`.
   * Re-reads the bill to fail closed on a concurrent payment. Returns false if
   * the bill can no longer be paid.
   */
  private async applyPayment(
    tx: TxClient,
    billId: string,
    bankTx: BankTx,
    actorId: string,
    source: string,
  ): Promise<boolean> {
    const bill = await tx.bill.findUnique({ where: { id: billId } });
    if (!bill || bill.status !== "COMPLETED" || bill.paidAt) return false;
    if (bill.totalVnd !== bankTx.amountVnd) return false;

    const paidAt = new Date();
    await tx.payment.create({
      data: {
        billId,
        method: "VIETQR",
        amountVnd: bill.totalVnd,
        reference: bankTx.referenceCode ?? bankTx.providerTxId,
      },
    });
    await tx.bill.update({ where: { id: billId }, data: { paidAt } });
    await tx.bankTransaction.update({
      where: { id: bankTx.id },
      data: { status: "MATCHED", matchedBillId: billId, branchId: bill.branchId },
    });

    await this.audit.record(tx, {
      action: "bill.pay",
      objectType: "bill",
      objectId: billId,
      actorId,
      branchId: bill.branchId,
      deviceId: bill.deviceId,
      after: { paidAt, totalVnd: bill.totalVnd, method: "VIETQR", source },
    });
    await this.audit.record(tx, {
      action: "bank.reconcile",
      objectType: "bank_transaction",
      objectId: bankTx.id,
      actorId,
      branchId: bill.branchId,
      after: { billId, source },
    });
    return true;
  }

  // ─── Manual review (V2 admin) ──────────────────────────────────────────────

  /** Paginated transaction list (newest first); rawPayload is never exposed. */
  async list(query: {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const transferredAt: { gte?: Date; lte?: Date } = {};
    if (query.from) transferredAt.gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) transferredAt.lte = new Date(`${query.to}T23:59:59Z`);
    const where: Prisma.BankTransactionWhereInput = {
      ...(query.status ? { status: query.status as Prisma.EnumBankTxStatusFilter["equals"] } : {}),
      ...(transferredAt.gte || transferredAt.lte ? { transferredAt } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          gateway: true,
          amountVnd: true,
          content: true,
          referenceCode: true,
          transferredAt: true,
          status: true,
          matchedBillId: true,
          note: true,
        },
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    // Resolve matched bill numbers for display (small page; no FK relation).
    const billIds = rows.map((r) => r.matchedBillId).filter((v): v is string => !!v);
    const numberById = new Map<string, string>();
    if (billIds.length > 0) {
      const bills = await this.prisma.bill.findMany({ where: { id: { in: billIds } }, select: { id: true, number: true } });
      for (const b of bills) numberById.set(b.id, b.number);
    }

    return {
      data: rows.map((r) => ({ ...r, matchedBillNumber: r.matchedBillId ? numberById.get(r.matchedBillId) ?? null : null })),
      total,
    };
  }

  /** Manually match by the human bill number (resolves to the bill then applies). */
  async matchByNumber(bankTxId: string, billNumber: string, actorId: string, access: BranchAccess) {
    const bill = await this.prisma.bill.findUnique({ where: { number: billNumber } });
    if (!bill) throw new NotFoundException("Không tìm thấy bill");
    return this.matchToBill(bankTxId, bill.id, actorId, access);
  }

  /** Manually attach a transaction to a bill (branch-access + amount checked). */
  async matchToBill(bankTxId: string, billId: string, actorId: string, access: BranchAccess) {
    const bankTx = await this.prisma.bankTransaction.findUnique({ where: { id: bankTxId } });
    if (!bankTx) throw new NotFoundException("Không tìm thấy giao dịch");
    if (bankTx.status === "MATCHED") throw new ConflictException("Giao dịch đã đối soát");

    const bill = await this.prisma.bill.findUnique({ where: { id: billId } });
    if (!bill) throw new NotFoundException("Không tìm thấy bill");
    assertBranchAccess(access, bill.branchId);
    if (bill.status !== "COMPLETED") throw new BadRequestException("Bill không ở trạng thái hợp lệ");
    if (bill.paidAt) throw new ConflictException("Bill đã thanh toán");
    if (bill.totalVnd !== bankTx.amountVnd) throw new BadRequestException("Số tiền không khớp tổng bill");

    return this.prisma.withTx(async (tx) => {
      const ok = await this.applyPayment(tx, billId, bankTx, actorId, "manual");
      if (!ok) throw new ConflictException("Bill đã thanh toán");
      return tx.bankTransaction.findUnique({ where: { id: bankTxId } });
    });
  }

  /** Mark a transaction as ignored (not a bill payment). */
  async ignore(bankTxId: string, note: string, actorId: string) {
    const bankTx = await this.prisma.bankTransaction.findUnique({ where: { id: bankTxId } });
    if (!bankTx) throw new NotFoundException("Không tìm thấy giao dịch");
    if (bankTx.status === "MATCHED") throw new ConflictException("Giao dịch đã đối soát");

    return this.prisma.withTx(async (tx) => {
      const updated = await tx.bankTransaction.update({
        where: { id: bankTxId },
        data: { status: "IGNORED", note: note || null },
      });
      await this.audit.record(tx, {
        action: "bank.reconcile.ignore",
        objectType: "bank_transaction",
        objectId: bankTxId,
        actorId,
        reason: note || undefined,
      });
      return updated;
    });
  }
}
