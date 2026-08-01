/**
 * BillsService — bill creation (server-authoritative price) and cancel.
 *
 * Invariants:
 *   - Server is sole source of price. Client DTO has NO price fields.
 *   - Bills are immutable snapshots: BillLine stores names/prices at creation time.
 *   - clientUuid dedup: if a bill for (deviceId, clientUuid) already exists, return it.
 *   - Cancel IDOR guard: only the device that opened the bill's shift can cancel.
 *   - Manager PIN required for cancel (approval flow).
 *   - Gapless bill numbers: BillNumberService.allocate() inside the bill-create tx.
 *   - Audit on every state change.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { PricingService } from "../pricing/pricing.service";
import { BillNumberService } from "./bill-number.service";
import { DiscountsService } from "../discounts/discounts.service";
import { sumVnd, toVnDateStr } from "@ilikebuffet/shared";
import { checkFreeTicketPolicy } from "./bill-policy";
import { buildResolvedLines } from "./resolved-lines";
import { assertBranchAccess, type BranchAccess } from "../../platform/rbac/branch-access";
import type { CreateBillDto, CancelBillDto } from "./bills.dto";

@Injectable()
export class BillsService {
  private readonly logger = new Logger(BillsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pricing: PricingService,
    private readonly billNumber: BillNumberService,
    private readonly discounts: DiscountsService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  async createBill(dto: CreateBillDto, actorId: string, role: string) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException("Bill phải có ít nhất 1 dòng vé");
    }
    if (dto.lines.some((l) => !Number.isInteger(l.qty) || l.qty < 1)) {
      throw new BadRequestException("qty phải là số nguyên dương");
    }

    return this.prisma.withTx(async (tx) => {
      // Step 1: idempotency check (offline resync)
      if (dto.clientUuid) {
        const existing = await tx.bill.findUnique({
          where: { deviceId_clientUuid: { deviceId: dto.deviceId, clientUuid: dto.clientUuid } },
          include: { lines: true, payments: true },
        });
        if (existing) {
          this.logger.log(`Idempotent bill return: id=${existing.id} clientUuid=${dto.clientUuid}`);
          return existing;
        }
      }

      // Step 2: validate shift and load branch code
      const shift = await tx.shift.findUnique({ where: { id: dto.shiftId } });
      if (!shift) {
        throw new BadRequestException(`Shift ${dto.shiftId} not found`);
      }
      if (shift.status !== "OPEN") {
        throw new ConflictException("Ca bán hàng không ở trạng thái OPEN");
      }
      if (shift.branchId !== dto.branchId) {
        throw new BadRequestException("Shift không thuộc chi nhánh này");
      }

      const branch = await tx.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) {
        throw new NotFoundException(`Branch ${dto.branchId} not found`);
      }

      // Step 3: resolve timestamps
      const createdAt = new Date();
      const businessDate = toVnDateStr(createdAt);

      // Step 4: resolve prices for each line (server-authoritative). Batch-load
      // ticket types + build the price resolver ONCE (snapshot + holiday loaded a
      // single time), then resolve every line from it. Online create
      // rejects a line with no applicable price.
      const ticketTypes = await tx.ticketType.findMany({
        where: { id: { in: [...new Set(dto.lines.map((l) => l.ticketTypeId))] } },
      });
      const ticketTypeById = new Map(ticketTypes.map((t) => [t.id, t]));
      const resolver = await this.pricing.buildResolver(dto.branchId, createdAt);
      const resolvedLines = buildResolvedLines(dto.lines, ticketTypeById, resolver, {
        rejectOnNoPrice: true,
      });

      // Step 5: policy checks
      const violation = checkFreeTicketPolicy(resolvedLines);
      if (violation) {
        throw new BadRequestException(violation.message);
      }

      const guestCount = resolvedLines.reduce((sum, l) => sum + l.qty, 0);
      const totalVnd = sumVnd(resolvedLines.map((l) => l.lineTotalVnd));

      // Step 6: allocate bill number (inside same tx, counter locked)
      const { seq, number } = await this.billNumber.allocate(
        tx,
        branch.code,
        dto.branchId,
        businessDate,
      );

      // Step 7: create Bill + BillLines, then audit (counter → audit lock order)
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
          clientUuid: dto.clientUuid ?? null,
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
        include: { lines: true },
      });

      await this.audit.record(tx, {
        action: "bill.create",
        objectType: "bill",
        objectId: bill.id,
        actorId,
        actorRole: role,
        branchId: dto.branchId,
        deviceId: dto.deviceId,
        after: {
          id: bill.id,
          number: bill.number,
          seq: bill.seq,
          totalVnd: bill.totalVnd,
          guestCount: bill.guestCount,
          lines: bill.lines.map((l) => ({
            ticketTypeId: l.ticketTypeId,
            ticketTypeName: l.ticketTypeName,
            unitPriceVnd: l.unitPriceVnd,
            qty: l.qty,
            lineTotalVnd: l.lineTotalVnd,
          })),
        },
      });

      this.logger.log(`Bill created: id=${bill.id} number=${bill.number} total=${bill.totalVnd}`);
      return bill;
    });
  }

  // ─── Get by ID ────────────────────────────────────────────────────────────────

  async getById(id: string, access: BranchAccess) {
    const bill = await this.prisma.bill.findUnique({
      where: { id },
      include: { lines: true, payments: true },
    });
    if (!bill) throw new NotFoundException(`Bill ${id} not found`);
    assertBranchAccess(access, bill.branchId); // route keyed by :id only
    return bill;
  }

  // ─── List by shift ────────────────────────────────────────────────────────────

  async listByShift(shiftId: string, access: BranchAccess) {
    // Scope results to the caller's branch(es): a cross-branch shiftId returns [].
    return this.prisma.bill.findMany({
      where: {
        shiftId,
        ...(access.chainWide ? {} : { branchId: { in: access.branchIds } }),
      },
      include: { lines: true, payments: true },
      orderBy: { createdAt: "asc" },
    });
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────────

  async cancelBill(
    billId: string,
    dto: CancelBillDto,
    actorId: string,
    role: string,
    access: BranchAccess,
  ) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { shift: true },
    });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found`);

    // Branch scope guard — defense-in-depth alongside the device check below.
    assertBranchAccess(access, bill.branchId);

    if (bill.status !== "COMPLETED") {
      throw new BadRequestException("Chỉ có thể huỷ bill ở trạng thái COMPLETED");
    }

    // IDOR guard: shift must be OPEN and device must match
    const callerDeviceId = dto.deviceId;
    if (bill.shift.status !== "OPEN" || bill.deviceId !== callerDeviceId) {
      await this.audit.record(this.prisma, {
        action: "bill.cancel_denied",
        objectType: "bill",
        objectId: billId,
        actorId,
        actorRole: role,
        branchId: bill.branchId,
        deviceId: callerDeviceId,
        reason:
          bill.shift.status !== "OPEN"
            ? "Ca bán hàng đã đóng"
            : "Thiết bị không khớp với bill",
      });
      throw new ForbiddenException(
        "Không thể huỷ bill: ca đã đóng hoặc thiết bị không khớp",
      );
    }

    return this.prisma.withTx(async (tx) => {
      // Verify the manager PIN inside the tx so the approval audit commits
      // atomically with the cancel (the wrong-PIN counter still commits eagerly).
      const pinResult = await this.discounts.verifyApprovalPin(
        {
          managerId: dto.managerId,
          pin: dto.pin,
          branchId: bill.branchId,
          reason: dto.reason,
        },
        actorId,
        role,
        tx,
      );
      if (!pinResult.approved) {
        throw new ForbiddenException("PIN quản lý không hợp lệ hoặc đã bị khoá");
      }

      const cancelledAt = new Date();

      const before = {
        status: bill.status,
        cancelledBy: bill.cancelledBy,
        cancelledAt: bill.cancelledAt,
        cancelReason: bill.cancelReason,
        cancelApprovedBy: bill.cancelApprovedBy,
      };

      const updated = await tx.bill.update({
        where: { id: billId },
        data: {
          status: "CANCELLED",
          cancelledBy: actorId,
          cancelledAt,
          cancelReason: dto.reason,
          cancelApprovedBy: dto.managerId,
        },
        include: { lines: true, payments: true },
      });

      await this.audit.record(tx, {
        action: "bill.cancel",
        objectType: "bill",
        objectId: billId,
        actorId,
        actorRole: role,
        branchId: bill.branchId,
        deviceId: bill.deviceId,
        before,
        after: {
          status: updated.status,
          cancelledBy: updated.cancelledBy,
          cancelledAt: updated.cancelledAt,
          cancelReason: updated.cancelReason,
          cancelApprovedBy: updated.cancelApprovedBy,
        },
        reason: dto.reason,
        approvedBy: dto.managerId,
      });

      this.logger.log(`Bill cancelled: id=${billId} by=${actorId} reason=${dto.reason}`);
      return updated;
    });
  }
}
