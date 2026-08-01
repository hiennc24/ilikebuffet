/**
 * PricingService — price matrix: time-windows, versioned price-book,
 * cells, branch overrides, server-side price resolution.
 *
 * Invariants:
 *   - Time windows must NOT overlap. Validated at create/update.
 *   - A price-book version that is currently effective (effectiveFrom <= today)
 *     is IMMUTABLE — editing is blocked; must clone into a new version.
 *   - Branch own-price: requires BranchPriceFlag.allowOwnPrice=true.
 *   - Price resolution: delegates to the shared pure resolver with a DB snapshot.
 *     Server is the single source of price — client never sends price.
 *   - isHoliday() from MasterDataService — no reimplementation.
 *   - Weekend = Saturday (dayOfWeek 6) or Sunday (0) in VN calendar. Weekend
 *     days are currently fixed (Sat+Sun); a future AC may make configurable.
 *   - All mutations audited in-tx.
 *   - Excel export: uses ExcelJS column-map approach.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Workbook } from "exceljs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { MasterDataService } from "../../platform/master-data/master-data.service";
import {
  resolvePrice,
  toVnDateStr,
  toVnDayOfWeek,
  type PriceBookSnapshot,
  type PriceBookVersionSnapshot,
  type PriceCellSnapshot,
  type TimeWindowSnapshot,
  type PriceResult,
} from "@ilikebuffet/shared";
import { assertVndInteger } from "@ilikebuffet/shared";
import type {
  CreateTimeWindowDto,
  UpdateTimeWindowDto,
  CreatePriceBookVersionDto,
  PriceBookVersionListQuery,
  UpsertPriceCellDto,
  SetBranchPriceFlagDto,
  ResolvePriceDto,
} from "./pricing.dto";

// ─── Overlap detection ────────────────────────────────────────────────────────

/**
 * Return true if two [start, end) half-open intervals overlap.
 * Used to enforce the time-window non-overlap invariant.
 */
function intervalsOverlap(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ─── Weekend check (VN calendar) ─────────────────────────────────────────────

/**
 * Return true if the date is Saturday or Sunday in Asia/Ho_Chi_Minh timezone.
 * Saturday = day-of-week 6, Sunday = 0 (VN local).
 * Pure function — injected into the shared resolver.
 */
function isVnWeekend(date: Date): boolean {
  const dow = toVnDayOfWeek(date);
  return dow === 0 || dow === 6;
}

/** A price resolver bound to one branch + deciding timestamp (see buildResolver). */
export interface PriceResolver {
  /** Price one line from the pre-built snapshot — pure, no I/O. */
  resolve(ticketTypeId: string, isFree: boolean): PriceResult;
  /** Time-window name from the snapshot (for the bill-line snapshot), or null. */
  timeWindowName(timeWindowId: string | null | undefined): string | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly masterData: MasterDataService,
  ) {}

  // ─── Time Windows ──────────────────────────────────────────────────────────

  async createTimeWindow(
    dto: CreateTimeWindowDto,
    actorId?: string,
    actorRole?: string,
  ) {
    this.validateWindowBounds(dto.startMinute, dto.endMinute);

    return this.prisma.withTx(async (tx) => {
      await this.assertNoOverlap(tx, dto.startMinute, dto.endMinute, null);

      const tw = await tx.timeWindow.create({
        data: {
          name: dto.name,
          startMinute: dto.startMinute,
          endMinute: dto.endMinute,
          displayOrder: dto.displayOrder ?? 0,
        },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "time_window.create",
        objectType: "time_window",
        objectId: tw.id,
        after: { name: tw.name, startMinute: tw.startMinute, endMinute: tw.endMinute },
      });

      return tw;
    });
  }

  async updateTimeWindow(
    id: string,
    dto: UpdateTimeWindowDto,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const existing = await tx.timeWindow.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`TimeWindow ${id} not found`);

      const newStart = dto.startMinute ?? existing.startMinute;
      const newEnd   = dto.endMinute   ?? existing.endMinute;

      this.validateWindowBounds(newStart, newEnd);
      await this.assertNoOverlap(tx, newStart, newEnd, id);

      const updated = await tx.timeWindow.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.startMinute !== undefined && { startMinute: dto.startMinute }),
          ...(dto.endMinute   !== undefined && { endMinute:   dto.endMinute }),
          ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "time_window.update",
        objectType: "time_window",
        objectId: id,
        before: { startMinute: existing.startMinute, endMinute: existing.endMinute },
        after:  { startMinute: updated.startMinute,  endMinute: updated.endMinute  },
      });

      return updated;
    });
  }

  async listTimeWindows() {
    return this.prisma.timeWindow.findMany({
      orderBy: [{ displayOrder: "asc" }, { startMinute: "asc" }],
    });
  }

  // ─── Price Book Versions ──────────────────────────────────────────────────

  async createPriceBookVersion(
    dto: CreatePriceBookVersionDto,
    actorId?: string,
    actorRole?: string,
  ) {
    // Validate effectiveFrom is a valid ISO date string.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.effectiveFrom)) {
      throw new BadRequestException("effectiveFrom must be in YYYY-MM-DD format");
    }

    return this.prisma.withTx(async (tx) => {
      const version = await tx.priceBookVersion.create({
        data: {
          name: dto.name,
          effectiveFrom: new Date(`${dto.effectiveFrom}T00:00:00.000Z`),
          branchId: dto.branchId ?? null,
          createdBy: actorId ?? null,
        },
      });

      // Clone cells from existing version if requested (create-new flow).
      if (dto.cloneFromVersionId) {
        const sourceCells = await tx.priceCell.findMany({
          where: { versionId: dto.cloneFromVersionId },
        });

        if (sourceCells.length > 0) {
          await tx.priceCell.createMany({
            data: sourceCells.map((c) => ({
              versionId: version.id,
              ticketTypeId: c.ticketTypeId,
              timeWindowId: c.timeWindowId,
              dayType: c.dayType,
              priceVnd: c.priceVnd,
              branchId: c.branchId,
            })),
            skipDuplicates: true,
          });
        }
      }

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "price_book_version.create",
        objectType: "price_book_version",
        objectId: version.id,
        after: {
          name: version.name,
          effectiveFrom: dto.effectiveFrom,
          branchId: version.branchId,
          clonedFrom: dto.cloneFromVersionId ?? null,
        },
      });

      this.logger.log(
        `PriceBookVersion created: id=${version.id} effectiveFrom=${dto.effectiveFrom} branchId=${version.branchId}`,
      );
      return version;
    });
  }

  /**
   * Guard: a price-book version whose effectiveFrom <= today is IMMUTABLE.
   * Editing cells on a live version → must create a new version (clone + edit).
   */
  async assertVersionEditable(versionId: string): Promise<void> {
    const version = await this.prisma.priceBookVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException(`PriceBookVersion ${versionId} not found`);

    const todayStr = toVnDateStr(new Date());
    const effectiveDateStr = toVnDateStr(version.effectiveFrom);

    if (effectiveDateStr <= todayStr) {
      throw new BadRequestException(
        `Price-book version "${version.name}" is currently effective and IMMUTABLE. ` +
        `Create a new version (clone from this one) to change prices.`,
      );
    }
  }

  async listPriceBookVersions(query: PriceBookVersionListQuery) {
    const where: Prisma.PriceBookVersionWhereInput = {};
    if (query.branchId !== undefined) {
      where.branchId = query.branchId;
    }
    return this.prisma.priceBookVersion.findMany({
      where,
      include: { cells: true },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    });
  }

  async getPriceBookVersion(id: string) {
    const v = await this.prisma.priceBookVersion.findUnique({
      where: { id },
      include: { cells: true },
    });
    if (!v) throw new NotFoundException(`PriceBookVersion ${id} not found`);
    return v;
  }

  // ─── Price Cells ──────────────────────────────────────────────────────────

  /**
   * Upsert a price cell on a version (version must be in the future).
   */
  async upsertPriceCell(
    versionId: string,
    dto: UpsertPriceCellDto,
    actorId?: string,
    actorRole?: string,
  ) {
    assertVndInteger(dto.priceVnd);
    if (dto.priceVnd < 0) {
      throw new BadRequestException("priceVnd must be >= 0");
    }

    await this.assertVersionEditable(versionId);

    return this.prisma.withTx(async (tx) => {
      // Upsert using unique constraint fields.
      // The schema has two partial unique indexes (chain vs branch) so we use
      // findFirst + create/update for clarity.
      const existing = await tx.priceCell.findFirst({
        where: {
          versionId,
          ticketTypeId: dto.ticketTypeId,
          timeWindowId: dto.timeWindowId,
          dayType: dto.dayType,
          branchId: dto.branchId ?? null,
        },
      });

      let cell;
      if (existing) {
        cell = await tx.priceCell.update({
          where: { id: existing.id },
          data: { priceVnd: dto.priceVnd },
        });
      } else {
        cell = await tx.priceCell.create({
          data: {
            versionId,
            ticketTypeId: dto.ticketTypeId,
            timeWindowId: dto.timeWindowId,
            dayType: dto.dayType,
            priceVnd: dto.priceVnd,
            branchId: dto.branchId ?? null,
          },
        });
      }

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "price_cell.upsert",
        objectType: "price_cell",
        objectId: cell.id,
        after: {
          versionId,
          ticketTypeId: dto.ticketTypeId,
          timeWindowId: dto.timeWindowId,
          dayType: dto.dayType,
          priceVnd: dto.priceVnd,
          branchId: dto.branchId ?? null,
        },
      });

      return cell;
    });
  }

  // ─── Branch price flag ────────────────────────────────────────────────────

  async setBranchPriceFlag(
    dto: SetBranchPriceFlagDto,
    actorId?: string,
    actorRole?: string,
  ) {
    return this.prisma.withTx(async (tx) => {
      const flag = await tx.branchPriceFlag.upsert({
        where: { branchId: dto.branchId },
        create: { branchId: dto.branchId, allowOwnPrice: dto.allowOwnPrice },
        update: { allowOwnPrice: dto.allowOwnPrice },
      });

      await this.audit.record(tx, {
        actorId,
        actorRole,
        action: "branch_price_flag.set",
        objectType: "branch_price_flag",
        objectId: dto.branchId,
        after: { allowOwnPrice: dto.allowOwnPrice },
      });

      return flag;
    });
  }

  // ─── Snapshot builder (for server-side resolution + offline cache) ─────────

  /**
   * Build a PriceBookSnapshot from the DB.
   *
   * This snapshot is:
   *   1. Passed to the shared resolvePrice() on the server for each bill creation.
   *   2. Serialised and sent to the POS client for offline caching.
   *
   * The snapshotGeneratedAt (wall-clock ms) enables cache-staleness detection
   * on reconnect (hydration-parity).
   */
  async buildSnapshot(): Promise<PriceBookSnapshot> {
    const [timeWindows, versions] = await Promise.all([
      this.prisma.timeWindow.findMany({ orderBy: { startMinute: "asc" } }),
      this.prisma.priceBookVersion.findMany({
        include: { cells: true },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const twSnapshots: TimeWindowSnapshot[] = timeWindows.map((tw) => ({
      id: tw.id,
      name: tw.name,
      startMinute: tw.startMinute,
      endMinute: tw.endMinute,
    }));

    const versionSnapshots: PriceBookVersionSnapshot[] = versions.map((v) => ({
      id: v.id,
      effectiveDateStr: toVnDateStr(v.effectiveFrom),
      branchId: v.branchId,
      cells: v.cells.map((c): PriceCellSnapshot => ({
        ticketTypeId: c.ticketTypeId,
        timeWindowId: c.timeWindowId,
        dayType: c.dayType as "REGULAR" | "WEEKEND" | "HOLIDAY",
        priceVnd: c.priceVnd,
        branchId: c.branchId,
      })),
    }));

    return {
      snapshotGeneratedAt: Date.now(),
      timeWindows: twSnapshots,
      versions: versionSnapshots,
    };
  }

  // ─── Server-side price resolver ───────────────────────────────────────────

  /**
   * Resolve price for a ticket at bill-creation time.
   *
   * Server is the single source of price. Client never sends price.
   * Delegates to the shared pure resolver with a fresh DB snapshot.
   *
   * @param dto  Contains branchId, ticketTypeId, createdAt, optional paidAt.
   */
  async resolvePrice(dto: ResolvePriceDto): Promise<PriceResult> {
    const ticketType = await this.prisma.ticketType.findUnique({
      where: { id: dto.ticketTypeId },
    });
    if (!ticketType) {
      throw new NotFoundException(`TicketType ${dto.ticketTypeId} not found`);
    }

    const snapshot = await this.buildSnapshot();

    const createdAt = new Date(dto.createdAt);
    const paidAt    = dto.paidAt ? new Date(dto.paidAt) : undefined;

    // isHolidayFn: uses MasterDataService.isHoliday() — no reimplementation here.
    // We cache the result for the deciding date to avoid N DB calls per bill.
    const isHolidayCache = new Map<string, boolean>();
    const isHolidayFn = (dateStr: string): boolean => {
      // Synchronous wrapper is safe here because buildSnapshot() is awaited
      // above. For async resolution in the hot-path, callers should pre-fetch
      // and inject; here we use a sync-compatible workaround via the cache.
      // Note: this is the SERVER path; the pure resolver stays sync.
      // We pre-fetch the deciding date's holiday status below.
      return isHolidayCache.get(dateStr) ?? false;
    };

    // Pre-fetch holiday status for the deciding date so the pure sync resolver
    // gets accurate data without breaking its purity contract.
    const decidingDate = createdAt; // PRICE_TIMESTAMP_FIELD default = createdAt
    const decidingDateStr = toVnDateStr(decidingDate);
    const isHoliday = await this.masterData.isHoliday(decidingDate, dto.branchId);
    isHolidayCache.set(decidingDateStr, isHoliday);

    return resolvePrice(
      dto.branchId,
      dto.ticketTypeId,
      ticketType.isFree,
      { createdAt, paidAt },
      isHolidayFn,
      isVnWeekend,
      snapshot,
    );
  }

  /**
   * Build a reusable price resolver for one branch + deciding timestamp. The
   * price-book snapshot and the holiday lookup are loaded ONCE; the returned
   * `resolve` is pure and can price every line of a bill without re-hitting the
   * DB. This is the hot-path entry (bill create / offline sync) — avoids the
   * O(lines) full-snapshot rebuild that resolvePrice() incurs per call.
   */
  async buildResolver(branchId: string, createdAt: Date): Promise<PriceResolver> {
    const snapshot = await this.buildSnapshot();
    const decidingDateStr = toVnDateStr(createdAt);
    const isHoliday = await this.masterData.isHoliday(createdAt, branchId);
    const isHolidayFn = (dateStr: string): boolean => (dateStr === decidingDateStr ? isHoliday : false);
    const twName = new Map(snapshot.timeWindows.map((tw) => [tw.id, tw.name]));
    return {
      resolve: (ticketTypeId: string, isFree: boolean): PriceResult =>
        resolvePrice(branchId, ticketTypeId, isFree, { createdAt }, isHolidayFn, isVnWeekend, snapshot),
      timeWindowName: (id) => (id ? (twName.get(id) ?? null) : null),
    };
  }

  // ─── Excel export ─────────────────────────────────────────────────────────

  /**
   * Export a price-book version as an Excel workbook for client sign-off.
   *
   * Layout: rows = ticket types, columns = time-window × day-type combinations.
   * Uses ExcelJS column-map approach (same pattern as master-data excel import — reused, not re-invented).
   */
  async exportPriceBookToExcel(versionId: string): Promise<Buffer> {
    const version = await this.prisma.priceBookVersion.findUnique({
      where: { id: versionId },
      include: { cells: true },
    });
    if (!version) throw new NotFoundException(`PriceBookVersion ${versionId} not found`);

    const [ticketTypes, timeWindows] = await Promise.all([
      this.prisma.ticketType.findMany({ orderBy: [{ displayOrder: "asc" }, { name: "asc" }] }),
      this.prisma.timeWindow.findMany({ orderBy: [{ displayOrder: "asc" }, { startMinute: "asc" }] }),
    ]);

    const DAY_TYPES: Array<{ key: string; label: string }> = [
      { key: "REGULAR", label: "Thường" },
      { key: "WEEKEND", label: "Cuối tuần" },
      { key: "HOLIDAY", label: "Lễ" },
    ];

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("Bảng giá");

    // Build column map: [Loại vé] + [twName × dayLabel] for each combination.
    const columnMap: Array<{ header: string; key: string }> = [
      { header: "Loại vé", key: "ticketTypeName" },
    ];
    for (const tw of timeWindows) {
      for (const dt of DAY_TYPES) {
        columnMap.push({
          header: `${tw.name} / ${dt.label}`,
          key: `${tw.id}__${dt.key}`,
        });
      }
    }

    sheet.columns = columnMap.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.header.length + 4,
    }));

    // Header styling.
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9EAD3" },
      };
    });

    // Build a lookup map for cells: `${ticketTypeId}__${timeWindowId}__${dayType}` → priceVnd
    const cellLookup = new Map<string, number>();
    for (const c of version.cells) {
      cellLookup.set(`${c.ticketTypeId}__${c.timeWindowId}__${c.dayType}`, c.priceVnd);
    }

    // Data rows.
    for (const tt of ticketTypes) {
      const rowData: Record<string, string | number> = {
        ticketTypeName: tt.isFree ? `${tt.name} (miễn phí)` : tt.name,
      };
      for (const tw of timeWindows) {
        for (const dt of DAY_TYPES) {
          const key = `${tt.id}__${tw.id}__${dt.key}`;
          const colKey = `${tw.id}__${dt.key}`;
          const price = cellLookup.get(key);
          rowData[colKey] = price !== undefined
            ? (tt.isFree ? 0 : price)
            : "-";
        }
      }
      sheet.addRow(rowData);
    }

    // Metadata row at the bottom.
    sheet.addRow({});
    sheet.addRow({ ticketTypeName: `Tên bảng giá: ${version.name}` });
    sheet.addRow({ ticketTypeName: `Hiệu lực từ: ${toVnDateStr(version.effectiveFrom)}` });

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  // ─── Private validation helpers ───────────────────────────────────────────

  private validateWindowBounds(startMinute: number, endMinute: number): void {
    if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) {
      throw new BadRequestException("startMinute must be an integer 0–1439");
    }
    if (!Number.isInteger(endMinute) || endMinute < 1 || endMinute > 1440) {
      throw new BadRequestException("endMinute must be an integer 1–1440");
    }
    if (endMinute <= startMinute) {
      throw new BadRequestException("endMinute must be greater than startMinute");
    }
  }

  /**
   * Assert that [startMinute, endMinute) does not overlap any existing
   * time window (excluding `excludeId` for update scenarios).
   */
  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    startMinute: number,
    endMinute: number,
    excludeId: string | null,
  ): Promise<void> {
    const all = await tx.timeWindow.findMany({
      where: excludeId ? { id: { not: excludeId } } : {},
    });

    const conflict = all.find((w) =>
      intervalsOverlap(startMinute, endMinute, w.startMinute, w.endMinute),
    );

    if (conflict) {
      throw new BadRequestException(
        `Time window [${startMinute}–${endMinute}) overlaps with existing window ` +
        `"${conflict.name}" [${conflict.startMinute}–${conflict.endMinute}).`,
      );
    }
  }
}
