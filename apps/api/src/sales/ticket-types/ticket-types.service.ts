/**
 * TicketTypesService — loại vé CRUD.
 *
 * Invariants:
 *   - No hard delete once a bill has been created: deactivate only.
 *     For MVP (no Bill model yet) we allow deactivate; the hasBilledChecker
 *     extension pattern mirrors ingredientHasTransactions from master-data.
 *   - Free ticket (isFree=true): priceVnd forced to 0 but COUNTS toward guest
 *     total for cost/khách. The bill layer enforces the count.
 *   - All mutations audited in-tx.
 *   - HQ-only mutations: role gate enforced at controller level.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { TicketTypeStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import type {
  CreateTicketTypeDto,
  UpdateTicketTypeDto,
  TicketTypeListQuery,
} from "./ticket-types.dto";

// ─── Billed-ticket checker (extensible — same pattern as ingredientHasTransactions) ──

export type BilledTicketChecker = (
  ticketTypeId: string,
  tx: Prisma.TransactionClient,
) => Promise<boolean>;

const billedCheckers: BilledTicketChecker[] = [
  // The bill module registers a real checker here once Bill model exists.
];

export async function ticketTypeHasBills(
  ticketTypeId: string,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  for (const check of billedCheckers) {
    if (await check(ticketTypeId, tx)) return true;
  }
  return false;
}

export function registerBilledTicketChecker(checker: BilledTicketChecker): void {
  billedCheckers.push(checker);
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class TicketTypesService {
  private readonly logger = new Logger(TicketTypesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateTicketTypeDto,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const ticketType = await tx.ticketType.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          displayOrder: dto.displayOrder ?? 0,
          color: dto.color ?? "#3B82F6",
          isFree: dto.isFree ?? false,
        },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "ticket_type.create",
        objectType: "ticket_type",
        objectId: ticketType.id,
        after: {
          name: ticketType.name,
          isFree: ticketType.isFree,
          displayOrder: ticketType.displayOrder,
        },
      });

      this.logger.log(`TicketType created: id=${ticketType.id} name=${ticketType.name} isFree=${ticketType.isFree}`);
      return ticketType;
    });
  }

  async update(
    id: string,
    dto: UpdateTicketTypeDto,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const existing = await tx.ticketType.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`TicketType ${id} not found`);
      if (existing.status === TicketTypeStatus.INACTIVE) {
        throw new BadRequestException("Cannot update an inactive ticket type");
      }

      const updated = await tx.ticketType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.isFree !== undefined && { isFree: dto.isFree }),
        },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "ticket_type.update",
        objectType: "ticket_type",
        objectId: id,
        before: {
          name: existing.name,
          description: existing.description,
          displayOrder: existing.displayOrder,
          color: existing.color,
          isFree: existing.isFree,
        },
        after: {
          name: updated.name,
          description: updated.description,
          displayOrder: updated.displayOrder,
          color: updated.color,
          isFree: updated.isFree,
        },
      });

      return updated;
    });
  }

  /**
   * Deactivate a ticket type. Hard delete is forbidden once bills exist.
   * For MVP (no Bill model) we always deactivate; bill-existence check added via
   * registerBilledTicketChecker() when the bill module ships.
   */
  async deactivate(id: string, actorId?: string, actorRole?: string) {
    return this.prisma.withTx(async (tx) => {
      const existing = await tx.ticketType.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`TicketType ${id} not found`);
      if (existing.status === TicketTypeStatus.INACTIVE) {
        throw new BadRequestException("Ticket type is already inactive");
      }

      const updated = await tx.ticketType.update({
        where: { id },
        data: { status: TicketTypeStatus.INACTIVE },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "ticket_type.deactivate",
        objectType: "ticket_type",
        objectId: id,
        before: { status: existing.status },
        after: { status: TicketTypeStatus.INACTIVE },
      });

      return updated;
    });
  }

  async findOne(id: string) {
    const tt = await this.prisma.ticketType.findUnique({ where: { id } });
    if (!tt) throw new NotFoundException(`TicketType ${id} not found`);
    return tt;
  }

  async list(query: TicketTypeListQuery) {
    const where: Prisma.TicketTypeWhereInput = {};
    if (!query.includeInactive) {
      where.status = TicketTypeStatus.ACTIVE;
    }
    return this.prisma.ticketType.findMany({
      where,
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });
  }
}
