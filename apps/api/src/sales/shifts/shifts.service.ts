/**
 * ShiftsService — BH-01 shift lifecycle (open, close, force-close).
 *
 * Invariants:
 *   - At most one OPEN shift per device — enforced by partial unique index
 *     `shift_one_open_per_device` (Prisma P2002 on violation → ConflictException).
 *   - Close: expectedCashVnd = openingCashVnd + SUM(CASH payments on COMPLETED bills).
 *     Non-zero variance requires a note (BH-07).
 *   - ForceClose: requires QUAN_LY_CN approval PIN (BH-01.4). M1 only marks
 *     + audits; figures are frozen for the TC-03 finance wave.
 *   - All mutations are audited inside the same transaction.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { DiscountsService } from "../discounts/discounts.service";
import { toVnDateStr } from "@ilikebuffet/shared";
import type {
  OpenShiftDto,
  CloseShiftDto,
  ForceCloseShiftDto,
  ShiftListQuery,
} from "./shifts.dto";

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly discounts: DiscountsService,
  ) {}

  // ─── Open ─────────────────────────────────────────────────────────────────

  async open(dto: OpenShiftDto, actorId: string, role: string) {
    const businessDate = new Date(`${toVnDateStr(new Date())}T00:00:00Z`);

    try {
      const shift = await this.prisma.withTx(async (tx) => {
        const created = await tx.shift.create({
          data: {
            branchId: dto.branchId,
            deviceId: dto.deviceId,
            businessDate,
            status: "OPEN",
            openedBy: actorId,
            openingCashVnd: dto.openingCashVnd,
          },
        });

        await this.audit.record(tx, {
          actorId,
          actorRole: role,
          action: "shift.open",
          objectType: "shift",
          objectId: created.id,
          branchId: dto.branchId,
          deviceId: dto.deviceId,
          after: {
            status: "OPEN",
            businessDate: created.businessDate,
            openingCashVnd: dto.openingCashVnd,
          },
        });

        return created;
      });

      this.logger.log(`shift.open id=${shift.id} device=${dto.deviceId}`);
      return shift;
    } catch (err) {
      // P2002 on the partial unique index → another OPEN shift exists for this device.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Thiết bị đã có ca đang mở");
      }
      throw err;
    }
  }

  // ─── Close ────────────────────────────────────────────────────────────────

  async close(shiftId: string, dto: CloseShiftDto, actorId: string, role: string) {
    return this.prisma.withTx(async (tx) => {
      const shift = await tx.shift.findUnique({ where: { id: shiftId } });
      if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);
      if (shift.status !== "OPEN") {
        throw new ConflictException("Ca không ở trạng thái mở");
      }

      // Sum CASH payments on COMPLETED bills in this shift.
      const cashAgg = await tx.payment.aggregate({
        where: {
          method: "CASH",
          bill: {
            shiftId,
            status: "COMPLETED",
          },
        },
        _sum: { amountVnd: true },
      });
      const cashTotal = cashAgg._sum.amountVnd ?? 0;
      const expectedCashVnd = shift.openingCashVnd + cashTotal;
      const varianceVnd = dto.countedCashVnd - expectedCashVnd;

      if (varianceVnd !== 0 && !dto.varianceNote) {
        throw new BadRequestException("Chênh lệch tiền mặt cần ghi chú");
      }

      const before = {
        status: shift.status,
        expectedCashVnd: shift.expectedCashVnd,
        countedCashVnd: shift.countedCashVnd,
        varianceVnd: shift.varianceVnd,
      };

      const updated = await tx.shift.update({
        where: { id: shiftId },
        data: {
          status: "CLOSED",
          closedBy: actorId,
          closedAt: new Date(),
          expectedCashVnd,
          countedCashVnd: dto.countedCashVnd,
          varianceVnd,
          varianceNote: dto.varianceNote ?? null,
          tempHighWater: dto.tempHighWater ?? null,
        },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole: role,
        action: "shift.close",
        objectType: "shift",
        objectId: shiftId,
        branchId: shift.branchId,
        deviceId: shift.deviceId,
        before,
        after: {
          status: "CLOSED",
          expectedCashVnd,
          countedCashVnd: dto.countedCashVnd,
          varianceVnd,
          varianceNote: dto.varianceNote ?? null,
        },
      });

      this.logger.log(
        `shift.close id=${shiftId} variance=${varianceVnd}`,
      );
      return updated;
    });
  }

  // ─── Force-close ──────────────────────────────────────────────────────────

  async forceClose(shiftId: string, dto: ForceCloseShiftDto, actorId: string, role: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);
    if (shift.status !== "OPEN") {
      throw new ConflictException("Ca không ở trạng thái mở");
    }

    // Verify manager approval PIN before mutating.
    const result = await this.discounts.verifyApprovalPin(
      { managerId: dto.managerId, pin: dto.pin, reason: dto.reason, branchId: shift.branchId },
      actorId,
      role,
    );
    if (!result.approved) {
      throw new ForbiddenException("PIN quản lý không hợp lệ");
    }

    return this.prisma.withTx(async (tx) => {
      const updated = await tx.shift.update({
        where: { id: shiftId },
        data: {
          status: "FORCE_CLOSED",
          closedBy: actorId,
          closedAt: new Date(),
          forceClosedBy: dto.managerId,
        },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole: role,
        action: "shift.force_close",
        objectType: "shift",
        objectId: shiftId,
        branchId: shift.branchId,
        deviceId: shift.deviceId,
        before: { status: "OPEN" },
        after: { status: "FORCE_CLOSED", forceClosedBy: dto.managerId },
        reason: dto.reason ?? null,
        approvedBy: dto.managerId,
      });

      this.logger.warn(
        `shift.force_close id=${shiftId} approvedBy=${dto.managerId} actor=${actorId}`,
      );
      return updated;
    });
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  async getOpenShift(deviceId: string) {
    return this.prisma.shift.findFirst({
      where: { deviceId, status: "OPEN" },
    });
  }

  async list(query: ShiftListQuery) {
    const where: Prisma.ShiftWhereInput = {};
    if (query.branchId) where.branchId = query.branchId;
    if (query.status) where.status = query.status;
    return this.prisma.shift.findMany({
      where,
      orderBy: { openedAt: "desc" },
    });
  }

  /**
   * Realtime shift summary for the manager monitor (BH-08). Aggregates the
   * shift's bills: revenue + guests + bills-per-type from COMPLETED bills,
   * cancellations, and the last-30-minute bill pace. Poll-friendly (≤60s);
   * branch scoping is enforced by the caller/guard via the shift's branch.
   */
  async summary(
    shiftId: string,
    access: { chainWide: boolean; branchIds: string[] },
    now: Date = new Date(),
  ) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);

    // Branch scope: a manager may only monitor shifts in their own branch(es).
    if (!access.chainWide && !access.branchIds.includes(shift.branchId)) {
      throw new ForbiddenException("Ngoài phạm vi chi nhánh");
    }

    const bills = await this.prisma.bill.findMany({
      where: { shiftId },
      include: { lines: true },
    });

    const completed = bills.filter((b) => b.status === "COMPLETED");
    const cancelledCount = bills.length - completed.length;

    const revenueVnd = completed.reduce((s, b) => s + b.totalVnd, 0);
    const guestCount = completed.reduce((s, b) => s + b.guestCount, 0);

    // Tickets sold per type (name snapshot from the bill lines).
    const byType = new Map<string, { ticketTypeId: string; name: string; qty: number }>();
    for (const b of completed) {
      for (const l of b.lines) {
        const cur = byType.get(l.ticketTypeId) ?? { ticketTypeId: l.ticketTypeId, name: l.ticketTypeName, qty: 0 };
        cur.qty += l.qty;
        byType.set(l.ticketTypeId, cur);
      }
    }

    // Bill pace over the last 30 minutes.
    const cutoff = now.getTime() - 30 * 60 * 1000;
    const last30mBills = completed.filter((b) => b.createdAt.getTime() >= cutoff).length;

    return {
      shiftId,
      branchId: shift.branchId,
      status: shift.status,
      openedAt: shift.openedAt,
      billCount: completed.length,
      cancelledCount,
      revenueVnd,
      guestCount,
      ticketsByType: [...byType.values()].sort((a, b) => b.qty - a.qty),
      last30mBills,
    };
  }
}
