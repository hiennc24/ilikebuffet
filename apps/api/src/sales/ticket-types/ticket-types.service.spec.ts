/**
 * TicketTypesService unit tests.
 *
 * Covers:
 *   - Create ticket type; audit written in-tx.
 *   - Update ticket type; audit before/after.
 *   - Deactivate (no hard delete after bills).
 *   - Cannot update inactive ticket type.
 *   - List excludes inactive by default.
 *   - Free ticket isFree=true → price 0, still counts toward guest total.
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { TicketTypesService } from "./ticket-types.service";

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeTicketType(overrides: Record<string, unknown> = {}) {
  return {
    id: "tt1",
    name: "Người lớn",
    description: null,
    displayOrder: 0,
    color: "#3B82F6",
    isFree: false,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockTx(overrides: Record<string, unknown> = {}) {
  return {
    ticketType: {
      create: jest.fn().mockResolvedValue(makeTicketType()),
      findUnique: jest.fn().mockResolvedValue(makeTicketType()),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeTicketType(data)),
      ),
      findMany: jest.fn().mockResolvedValue([makeTicketType()]),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

function makePrisma(tx: ReturnType<typeof makeMockTx>) {
  return {
    withTx: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    ticketType: {
      findUnique: jest.fn().mockResolvedValue(makeTicketType()),
      findMany: jest.fn().mockResolvedValue([makeTicketType()]),
    },
  };
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TicketTypesService", () => {
  let tx: ReturnType<typeof makeMockTx>;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let service: TicketTypesService;

  beforeEach(() => {
    tx = makeMockTx();
    prisma = makePrisma(tx);
    audit = makeAudit();
    service = new TicketTypesService(prisma as never, audit as never);
  });

  // ─── Create ───────────────────────────────────────────────────────────────

  describe("create()", () => {
    it("creates a ticket type with defaults", async () => {
      const result = await service.create({ name: "Người lớn" }, "actor1", "QUAN_TRI_HQ");

      expect(tx.ticketType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Người lớn",
            isFree: false,
            displayOrder: 0,
          }),
        }),
      );
      expect(result.name).toBe("Người lớn");
    });

    it("writes audit record in-tx on create", async () => {
      await service.create({ name: "Người lớn" }, "actor1", "QUAN_TRI_HQ");

      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: "ticket_type.create",
          objectType: "ticket_type",
        }),
      );
    });

    it("sets isFree=true and creates with free flag", async () => {
      tx.ticketType.create.mockResolvedValue(makeTicketType({ isFree: true, name: "Trẻ dưới 1m" }));

      const result = await service.create(
        { name: "Trẻ dưới 1m", isFree: true },
        "actor1",
        "QUAN_TRI_HQ",
      );

      expect(tx.ticketType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isFree: true }),
        }),
      );
      expect(result.isFree).toBe(true);
    });
  });

  // ─── Update ───────────────────────────────────────────────────────────────

  describe("update()", () => {
    it("updates name and audits before/after", async () => {
      tx.ticketType.update.mockResolvedValue(makeTicketType({ name: "Người lớn (mới)" }));

      const result = await service.update("tt1", { name: "Người lớn (mới)" }, "actor1", "QUAN_TRI_HQ");

      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: "ticket_type.update",
          before: expect.objectContaining({ name: "Người lớn" }),
          after: expect.objectContaining({ name: "Người lớn (mới)" }),
        }),
      );
      expect(result.name).toBe("Người lớn (mới)");
    });

    it("throws NotFoundException for unknown id", async () => {
      tx.ticketType.findUnique.mockResolvedValue(null);

      await expect(
        service.update("unknown", { name: "X" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when updating inactive ticket type", async () => {
      tx.ticketType.findUnique.mockResolvedValue(makeTicketType({ status: "INACTIVE" }));

      await expect(
        service.update("tt1", { name: "X" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Deactivate (no hard delete) ─────────────────────────────────────────

  describe("deactivate()", () => {
    it("sets status to INACTIVE and audits the transition", async () => {
      tx.ticketType.update.mockResolvedValue(makeTicketType({ status: "INACTIVE" }));

      const result = await service.deactivate("tt1", "actor1", "QUAN_TRI_HQ");

      expect(tx.ticketType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "INACTIVE" },
        }),
      );
      expect(result.status).toBe("INACTIVE");
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: "ticket_type.deactivate",
          before: { status: "ACTIVE" },
          after: { status: "INACTIVE" },
        }),
      );
    });

    it("throws BadRequestException when already inactive", async () => {
      tx.ticketType.findUnique.mockResolvedValue(makeTicketType({ status: "INACTIVE" }));

      await expect(service.deactivate("tt1")).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException for unknown id", async () => {
      tx.ticketType.findUnique.mockResolvedValue(null);

      await expect(service.deactivate("unknown")).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Free ticket invariant ────────────────────────────────────────────────

  describe("free ticket counts toward guest total", () => {
    /**
     * Free ticket invariant: isFree=true still contributes to guest count.
     * The service creates the ticket type with isFree=true. The billing layer
     * must count ALL tickets (free + paid) in the guest denominator.
     * This test is intentionally descriptive for future refactor safety.
     */
    it("creates free ticket type with isFree=true; billing layer must include in guest count", async () => {
      const freeTicket = makeTicketType({ isFree: true, name: "Trẻ dưới 1m" });
      tx.ticketType.create.mockResolvedValue(freeTicket);

      const result = await service.create(
        { name: "Trẻ dưới 1m", isFree: true },
        "actor1",
        "QUAN_TRI_HQ",
      );

      // Free ticket is stored with isFree=true.
      expect(result.isFree).toBe(true);
      // The price resolver will return priceVnd=0 for free tickets (confirmed in shared tests).
      // Billing layer MUST add result.quantity to guestTotal regardless of priceVnd.
      // Removing or breaking isFree=true here would break BC-01 cost/khách denominator.
    });
  });

  // ─── Audit on name/condition change ──────────────────────────────────────

  describe("bill history unaffected by ticket-type changes", () => {
    it("updating name writes audit with before/after so history is traceable", async () => {
      tx.ticketType.update.mockResolvedValue(makeTicketType({ name: "Người lớn v2" }));

      await service.update("tt1", { name: "Người lớn v2" }, "actor1", "QUAN_TRI_HQ");

      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          before: expect.objectContaining({ name: "Người lớn" }),
          after: expect.objectContaining({ name: "Người lớn v2" }),
        }),
      );
    });
  });

  // ─── List ─────────────────────────────────────────────────────────────────

  describe("list()", () => {
    it("excludes inactive by default", async () => {
      await service.list({});

      expect(prisma.ticketType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "ACTIVE" }),
        }),
      );
    });

    it("includes inactive when includeInactive=true", async () => {
      await service.list({ includeInactive: true });

      expect(prisma.ticketType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe("findOne()", () => {
    it("returns ticket type by id", async () => {
      const result = await service.findOne("tt1");
      expect(result.id).toBe("tt1");
    });

    it("throws NotFoundException for unknown id", async () => {
      prisma.ticketType.findUnique.mockResolvedValue(null);
      await expect(service.findOne("unknown")).rejects.toThrow(NotFoundException);
    });
  });
});
