/**
 * PricingService unit tests (VG-02 AC + Red Team C2/C9/M2).
 *
 * Covers:
 *   - Time-window overlap → save blocked (VG-02.1).
 *   - Time-window bounds validation.
 *   - Effective version is IMMUTABLE (VG-02.3).
 *   - Future version → editable; today's version → immutable.
 *   - Price-cell upsert on future version.
 *   - Price-cell rejected on live version.
 *   - resolvePrice delegates to pure resolver; isHoliday from MasterDataService (M2).
 *   - buildSnapshot shape (fields present, time-windows + versions).
 *   - Branch price flag upsert.
 *   - All mutations audited in-tx.
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PricingService } from "./pricing.service";
import { toVnDateStr } from "@ilikebuffet/shared";

// ─── Date helpers ─────────────────────────────────────────────────────────────

const TODAY = toVnDateStr(new Date());

/** ISO date string N days from today. */
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toVnDateStr(d);
}

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeTimeWindow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tw1",
    name: "Tối",
    startMinute: 1020,
    endMinute: 1320,
    displayOrder: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

function makePriceBookVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    name: "Q1/2026",
    effectiveFrom: new Date(`${daysFromNow(1)}T00:00:00.000Z`), // future by default
    branchId: null,
    createdAt: new Date(),
    createdBy: null,
    cells: [],
    ...overrides,
  };
}

function makePriceCell(overrides: Record<string, unknown> = {}) {
  return {
    id: "pc1",
    versionId: "v1",
    ticketTypeId: "tt1",
    timeWindowId: "tw1",
    dayType: "REGULAR",
    priceVnd: 150_000,
    branchId: null,
    ...overrides,
  };
}

function makeTicketType(overrides: Record<string, unknown> = {}) {
  return {
    id: "tt1",
    name: "Người lớn",
    isFree: false,
    status: "ACTIVE",
    displayOrder: 0,
    color: "#3B82F6",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockTx(overrides: Record<string, unknown> = {}) {
  return {
    timeWindow: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(makeTimeWindow()),
      create: jest.fn().mockResolvedValue(makeTimeWindow()),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeTimeWindow(data)),
      ),
    },
    priceBookVersion: {
      findUnique: jest.fn().mockResolvedValue(makePriceBookVersion()),
      create: jest.fn().mockResolvedValue(makePriceBookVersion()),
      findMany: jest.fn().mockResolvedValue([]),
    },
    priceCell: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(makePriceCell()),
      update: jest.fn().mockResolvedValue(makePriceCell()),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    branchPriceFlag: {
      upsert: jest.fn().mockResolvedValue({ branchId: "branch1", allowOwnPrice: true }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

function makePrisma(tx: ReturnType<typeof makeMockTx>) {
  return {
    withTx: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    timeWindow: {
      findMany: jest.fn().mockResolvedValue([makeTimeWindow()]),
    },
    priceBookVersion: {
      findUnique: jest.fn().mockResolvedValue(makePriceBookVersion()),
      findMany: jest.fn().mockResolvedValue([makePriceBookVersion()]),
    },
    priceCell: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    ticketType: {
      findUnique: jest.fn().mockResolvedValue(makeTicketType()),
      findMany: jest.fn().mockResolvedValue([makeTicketType()]),
    },
  };
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

function makeMasterData() {
  return { isHoliday: jest.fn().mockResolvedValue(false) };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("PricingService", () => {
  let tx: ReturnType<typeof makeMockTx>;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let masterData: ReturnType<typeof makeMasterData>;
  let service: PricingService;

  beforeEach(() => {
    tx = makeMockTx();
    prisma = makePrisma(tx);
    audit = makeAudit();
    masterData = makeMasterData();
    service = new PricingService(prisma as never, audit as never, masterData as never);
  });

  // ─── VG-02.1 Time-window overlap ─────────────────────────────────────────

  describe("createTimeWindow() — overlap validation (VG-02.1)", () => {
    it("creates a window when no overlaps exist", async () => {
      tx.timeWindow.findMany.mockResolvedValue([]); // no existing windows
      const result = await service.createTimeWindow(
        { name: "Tối", startMinute: 1020, endMinute: 1320 },
        "actor1",
      );
      expect(result.name).toBe("Tối");
      expect(tx.timeWindow.create).toHaveBeenCalled();
    });

    it("blocks save when new window overlaps existing window (VG-02.1)", async () => {
      // Existing: Trưa 630–840
      tx.timeWindow.findMany.mockResolvedValue([
        makeTimeWindow({ startMinute: 630, endMinute: 840 }),
      ]);

      // New: 700–900 overlaps Trưa
      await expect(
        service.createTimeWindow({ name: "Overlap", startMinute: 700, endMinute: 900 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("blocks save when new window is completely inside existing window", async () => {
      tx.timeWindow.findMany.mockResolvedValue([
        makeTimeWindow({ startMinute: 600, endMinute: 900 }),
      ]);
      await expect(
        service.createTimeWindow({ name: "Inside", startMinute: 650, endMinute: 800 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("allows adjacent windows that share a boundary but do not overlap", async () => {
      // Trưa ends at 840 = Tối starts at 840 — adjacent, not overlapping.
      tx.timeWindow.findMany.mockResolvedValue([
        makeTimeWindow({ startMinute: 630, endMinute: 840 }),
      ]);
      await expect(
        service.createTimeWindow({ name: "Adjacent", startMinute: 840, endMinute: 1020 }),
      ).resolves.toBeDefined();
    });

    it("validates bounds: endMinute must be > startMinute", async () => {
      await expect(
        service.createTimeWindow({ name: "Bad", startMinute: 900, endMinute: 900 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("validates bounds: startMinute must be 0–1439", async () => {
      await expect(
        service.createTimeWindow({ name: "Bad", startMinute: -1, endMinute: 60 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("updateTimeWindow() — overlap validation", () => {
    it("blocks update when new bounds would overlap another existing window", async () => {
      tx.timeWindow.findUnique.mockResolvedValue(makeTimeWindow({ id: "tw2", startMinute: 1020, endMinute: 1320 }));
      // Another existing window
      tx.timeWindow.findMany.mockResolvedValue([
        makeTimeWindow({ id: "tw1", startMinute: 630, endMinute: 840 }),
      ]);

      await expect(
        service.updateTimeWindow("tw2", { startMinute: 700, endMinute: 900 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("allows self-update (exclude self from overlap check)", async () => {
      // Only window is itself.
      tx.timeWindow.findMany.mockResolvedValue([]); // excludeId removes self
      await expect(
        service.updateTimeWindow("tw1", { name: "Tối mới" }),
      ).resolves.toBeDefined();
    });

    it("throws NotFoundException for unknown window id", async () => {
      tx.timeWindow.findUnique.mockResolvedValue(null);
      await expect(
        service.updateTimeWindow("unknown", { name: "X" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── VG-02.3 Versioning — immutability of live version ───────────────────

  describe("assertVersionEditable() — VG-02.3 immutability", () => {
    it("allows editing a future version (effectiveFrom > today)", async () => {
      const futureVersion = makePriceBookVersion({
        effectiveFrom: new Date(`${daysFromNow(3)}T00:00:00.000Z`),
      });
      prisma.priceBookVersion.findUnique.mockResolvedValue(futureVersion);

      await expect(service.assertVersionEditable("v1")).resolves.toBeUndefined();
    });

    it("blocks editing a version effective today or earlier (VG-02.3)", async () => {
      const liveVersion = makePriceBookVersion({
        effectiveFrom: new Date(`${TODAY}T00:00:00.000Z`),
      });
      prisma.priceBookVersion.findUnique.mockResolvedValue(liveVersion);

      await expect(service.assertVersionEditable("v1")).rejects.toThrow(BadRequestException);
    });

    it("blocks editing a version effective in the past (VG-02.3)", async () => {
      const pastVersion = makePriceBookVersion({
        effectiveFrom: new Date(`${daysFromNow(-5)}T00:00:00.000Z`),
      });
      prisma.priceBookVersion.findUnique.mockResolvedValue(pastVersion);

      await expect(service.assertVersionEditable("v1")).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException for unknown version id", async () => {
      prisma.priceBookVersion.findUnique.mockResolvedValue(null);
      await expect(service.assertVersionEditable("unknown")).rejects.toThrow(NotFoundException);
    });
  });

  describe("createPriceBookVersion()", () => {
    it("creates a version and audits in-tx", async () => {
      const result = await service.createPriceBookVersion(
        { name: "Q2/2026", effectiveFrom: daysFromNow(10) },
        "actor1",
        "QUAN_TRI_HQ",
      );

      expect(tx.priceBookVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "Q2/2026" }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: "price_book_version.create" }),
      );
      expect(result).toBeDefined();
    });

    it("rejects invalid effectiveFrom format", async () => {
      await expect(
        service.createPriceBookVersion({ name: "Bad", effectiveFrom: "not-a-date" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("clones cells from source version when cloneFromVersionId is provided", async () => {
      tx.priceCell.findMany.mockResolvedValue([
        makePriceCell({ id: "orig-cell" }),
      ]);

      await service.createPriceBookVersion(
        { name: "Clone", effectiveFrom: daysFromNow(10), cloneFromVersionId: "v-source" },
        "actor1",
      );

      expect(tx.priceCell.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              ticketTypeId: "tt1",
              priceVnd: 150_000,
            }),
          ]),
        }),
      );
    });
  });

  // ─── Price-cell upsert ────────────────────────────────────────────────────

  describe("upsertPriceCell()", () => {
    it("creates a new cell on a future version", async () => {
      // Future version → editable
      prisma.priceBookVersion.findUnique.mockResolvedValue(
        makePriceBookVersion({ effectiveFrom: new Date(`${daysFromNow(3)}T00:00:00.000Z`) }),
      );

      const result = await service.upsertPriceCell(
        "v1",
        { ticketTypeId: "tt1", timeWindowId: "tw1", dayType: "REGULAR", priceVnd: 180_000 },
        "actor1",
      );

      expect(tx.priceCell.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priceVnd: 180_000 }),
        }),
      );
      expect(result).toBeDefined();
    });

    it("updates existing cell (upsert path)", async () => {
      prisma.priceBookVersion.findUnique.mockResolvedValue(
        makePriceBookVersion({ effectiveFrom: new Date(`${daysFromNow(3)}T00:00:00.000Z`) }),
      );
      tx.priceCell.findFirst.mockResolvedValue(makePriceCell({ id: "existing-cell" }));

      await service.upsertPriceCell(
        "v1",
        { ticketTypeId: "tt1", timeWindowId: "tw1", dayType: "REGULAR", priceVnd: 200_000 },
        "actor1",
      );

      expect(tx.priceCell.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "existing-cell" },
          data: { priceVnd: 200_000 },
        }),
      );
    });

    it("rejects cell upsert on a live (immutable) version (VG-02.3)", async () => {
      // Live version → immutable
      prisma.priceBookVersion.findUnique.mockResolvedValue(
        makePriceBookVersion({ effectiveFrom: new Date(`${TODAY}T00:00:00.000Z`) }),
      );

      await expect(
        service.upsertPriceCell(
          "v1",
          { ticketTypeId: "tt1", timeWindowId: "tw1", dayType: "REGULAR", priceVnd: 999 },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects negative priceVnd", async () => {
      await expect(
        service.upsertPriceCell(
          "v1",
          { ticketTypeId: "tt1", timeWindowId: "tw1", dayType: "REGULAR", priceVnd: -1 },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects non-integer priceVnd", async () => {
      await expect(
        service.upsertPriceCell(
          "v1",
          { ticketTypeId: "tt1", timeWindowId: "tw1", dayType: "REGULAR", priceVnd: 150_000.5 },
        ),
      ).rejects.toThrow();
    });

    it("writes audit record in-tx", async () => {
      prisma.priceBookVersion.findUnique.mockResolvedValue(
        makePriceBookVersion({ effectiveFrom: new Date(`${daysFromNow(3)}T00:00:00.000Z`) }),
      );

      await service.upsertPriceCell(
        "v1",
        { ticketTypeId: "tt1", timeWindowId: "tw1", dayType: "HOLIDAY", priceVnd: 250_000 },
        "actor1",
        "QUAN_TRI_HQ",
      );

      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: "price_cell.upsert",
          after: expect.objectContaining({ priceVnd: 250_000, dayType: "HOLIDAY" }),
        }),
      );
    });
  });

  // ─── resolvePrice — server delegation ────────────────────────────────────

  describe("resolvePrice() — server delegates to pure resolver (M2 isHoliday)", () => {
    it("calls masterData.isHoliday for the deciding date (Red Team M2)", async () => {
      prisma.timeWindow.findMany.mockResolvedValue([
        makeTimeWindow({ startMinute: 1020, endMinute: 1320 }),
      ]);
      prisma.priceBookVersion.findMany.mockResolvedValue([
        makePriceBookVersion({
          effectiveFrom: new Date(`${TODAY}T00:00:00.000Z`),
          cells: [
            {
              ticketTypeId: "tt1",
              timeWindowId: "tw1",
              timeWindow: {},
              dayType: "REGULAR",
              priceVnd: 150_000,
              branchId: null,
            },
          ],
        }),
      ]);

      masterData.isHoliday.mockResolvedValue(false);

      const result = await service.resolvePrice({
        branchId: "branch1",
        ticketTypeId: "tt1",
        // 18:00 VN = UTC+7 → UTC 11:00
        createdAt: new Date(`${TODAY}T11:00:00.000Z`).toISOString(),
      });

      expect(masterData.isHoliday).toHaveBeenCalled();
      // Result is either PRICE or NO_PRICE depending on snapshot; we just confirm no exception.
      expect(result).toBeDefined();
      expect(result).toHaveProperty("kind");
    });

    it("throws NotFoundException for unknown ticketTypeId", async () => {
      prisma.ticketType.findUnique.mockResolvedValue(null);

      await expect(
        service.resolvePrice({
          branchId: "branch1",
          ticketTypeId: "unknown",
          createdAt: new Date().toISOString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── buildSnapshot ────────────────────────────────────────────────────────

  describe("buildSnapshot()", () => {
    it("returns a PriceBookSnapshot with required fields", async () => {
      prisma.timeWindow.findMany.mockResolvedValue([makeTimeWindow()]);
      prisma.priceBookVersion.findMany.mockResolvedValue([
        makePriceBookVersion({ cells: [makePriceCell()] }),
      ]);

      const snapshot = await service.buildSnapshot();

      expect(snapshot).toHaveProperty("snapshotGeneratedAt");
      expect(typeof snapshot.snapshotGeneratedAt).toBe("number");
      expect(snapshot.timeWindows).toHaveLength(1);
      expect(snapshot.versions).toHaveLength(1);
      expect(snapshot.versions[0]!.cells).toHaveLength(1);
    });

    it("snapshot contains effectiveDateStr as YYYY-MM-DD (not raw Date)", async () => {
      prisma.priceBookVersion.findMany.mockResolvedValue([
        makePriceBookVersion({ effectiveFrom: new Date("2026-03-01T00:00:00.000Z") }),
      ]);

      const snapshot = await service.buildSnapshot();
      expect(snapshot.versions[0]!.effectiveDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ─── Branch price flag ────────────────────────────────────────────────────

  describe("setBranchPriceFlag()", () => {
    it("upserts the flag and audits in-tx", async () => {
      const result = await service.setBranchPriceFlag(
        { branchId: "branch1", allowOwnPrice: true },
        "actor1",
        "QUAN_TRI_HQ",
      );

      expect(tx.branchPriceFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId: "branch1" },
          update: { allowOwnPrice: true },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: "branch_price_flag.set",
          after: { allowOwnPrice: true },
        }),
      );
      expect(result.allowOwnPrice).toBe(true);
    });
  });
});
