/**
 * PaymentsService — BH-03 record payments against a completed bill.
 *
 * Invariants:
 *   - Bill must be COMPLETED (not CANCELLED, not already paid).
 *   - Sum of payment amounts must equal bill.totalVnd EXACTLY.
 *   - Each amountVnd must be a positive integer.
 *   - Payments array must not be empty.
 *   - All Payment rows + bill.paidAt update are atomic (withTx).
 *   - Audited in-tx (GA-01).
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PaymentMethod } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { assertBranchAccess, type BranchAccess } from "../../platform/rbac/branch-access";
import type { AddPaymentsDto } from "./payments.dto";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async addPayments(
    billId: string,
    dto: AddPaymentsDto,
    actorId: string,
    role: string,
    access: BranchAccess,
  ) {
    // Validate input before hitting DB
    if (!dto.payments || dto.payments.length === 0) {
      throw new BadRequestException("Phải có ít nhất 1 phương thức thanh toán");
    }
    for (const p of dto.payments) {
      if (!Number.isInteger(p.amountVnd) || p.amountVnd <= 0) {
        throw new BadRequestException("amountVnd phải là số nguyên dương");
      }
      if (p.tenderedVnd !== undefined) {
        if (p.method !== "CASH") {
          throw new BadRequestException("Chỉ tiền mặt mới có số tiền khách đưa");
        }
        if (!Number.isInteger(p.tenderedVnd) || p.tenderedVnd < p.amountVnd) {
          throw new BadRequestException("Tiền khách đưa phải là số nguyên và không nhỏ hơn số tiền phải trả");
        }
      }
    }

    // Load bill outside tx for a quick pre-check
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
    });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found`);

    // The route is keyed only by billId, so re-check the bill's branch here (C1).
    assertBranchAccess(access, bill.branchId);

    if (bill.status !== "COMPLETED") {
      throw new BadRequestException("Chỉ có thể thanh toán bill ở trạng thái COMPLETED");
    }
    if (bill.paidAt) {
      throw new ConflictException("Bill đã thanh toán");
    }

    const sum = dto.payments.reduce((acc, p) => acc + p.amountVnd, 0);
    if (sum !== bill.totalVnd) {
      throw new BadRequestException("Tổng thanh toán phải bằng tổng bill");
    }

    return this.prisma.withTx(async (tx) => {
      // Re-read bill inside tx to guard against concurrent payment (serialise on bill row)
      const billInTx = await tx.bill.findUnique({ where: { id: billId } });
      if (!billInTx) throw new NotFoundException(`Bill ${billId} not found`);
      if (billInTx.paidAt) throw new ConflictException("Bill đã thanh toán");

      const paidAt = new Date();

      await tx.payment.createMany({
        data: dto.payments.map((p) => ({
          billId,
          method: p.method as PaymentMethod,
          amountVnd: p.amountVnd,
          // Cash over-tender: store what the customer handed over and the change.
          tenderedVnd: p.tenderedVnd ?? null,
          changeVnd: p.tenderedVnd !== undefined ? p.tenderedVnd - p.amountVnd : null,
          reference: p.reference ?? null,
        })),
      });

      const updated = await tx.bill.update({
        where: { id: billId },
        data: { paidAt },
        include: { lines: true, payments: true },
      });

      await this.audit.record(tx, {
        action: "bill.pay",
        objectType: "bill",
        objectId: billId,
        actorId,
        actorRole: role,
        branchId: bill.branchId,
        deviceId: bill.deviceId,
        after: {
          paidAt,
          totalVnd: bill.totalVnd,
          payments: dto.payments.map((p) => ({
            method: p.method,
            amountVnd: p.amountVnd,
            tenderedVnd: p.tenderedVnd ?? null,
            changeVnd: p.tenderedVnd !== undefined ? p.tenderedVnd - p.amountVnd : null,
          })),
        },
      });

      this.logger.log(`Bill paid: id=${billId} total=${bill.totalVnd} methods=${dto.payments.map((p) => p.method).join(",")}`);
      return updated;
    });
  }
}
