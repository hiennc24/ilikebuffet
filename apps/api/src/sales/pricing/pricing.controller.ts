/**
 * PricingController — VG-02 HTTP endpoints.
 *
 * Role gates:
 *   - Time windows: QUAN_TRI_HQ only (chain-wide config, @Unscoped).
 *   - Price-book versions / cells: QUAN_TRI_HQ only.
 *   - Branch price flag: QUAN_TRI_HQ only.
 *   - List versions / snapshot: all authenticated.
 *   - resolvePrice: all authenticated (POS calls this at bill creation).
 *   - Excel export: authenticated, QUAN_TRI_HQ / QUAN_LY_CN.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { PricingService } from "./pricing.service";
import { Unscoped } from "../../platform/rbac/decorators";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type {
  CreateTimeWindowDto,
  UpdateTimeWindowDto,
  CreatePriceBookVersionDto,
  PriceBookVersionListQuery,
  UpsertPriceCellDto,
  SetBranchPriceFlagDto,
  ResolvePriceDto,
} from "./pricing.dto";

// ─── Time Windows ─────────────────────────────────────────────────────────────

@Unscoped()
@Controller("sales/pricing/time-windows")
export class TimeWindowController {
  constructor(private readonly service: PricingService) {}

  @Get()
  list() {
    return this.service.listTimeWindows();
  }

  @Post()
  create(@Body() dto: CreateTimeWindowDto, @Request() req: ScopedRequest) {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ can manage time windows");
    }
    return this.service.createTimeWindow(dto, req.user.sub, req.user.role);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTimeWindowDto,
    @Request() req: ScopedRequest,
  ) {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ can manage time windows");
    }
    return this.service.updateTimeWindow(id, dto, req.user.sub, req.user.role);
  }
}

// ─── Price Book Versions ──────────────────────────────────────────────────────

@Unscoped()
@Controller("sales/pricing/versions")
export class PriceBookVersionController {
  constructor(private readonly service: PricingService) {}

  @Get()
  list(@Query() query: PriceBookVersionListQuery) {
    return this.service.listPriceBookVersions(query);
  }

  @Get("snapshot")
  snapshot() {
    return this.service.buildSnapshot();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.getPriceBookVersion(id);
  }

  @Post()
  create(@Body() dto: CreatePriceBookVersionDto, @Request() req: ScopedRequest) {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ can manage price-book versions");
    }
    return this.service.createPriceBookVersion(dto, req.user.sub, req.user.role);
  }

  @Put(":versionId/cells")
  upsertCell(
    @Param("versionId") versionId: string,
    @Body() dto: UpsertPriceCellDto,
    @Request() req: ScopedRequest,
  ) {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ can manage price cells");
    }
    return this.service.upsertPriceCell(versionId, dto, req.user.sub, req.user.role);
  }

  @Get(":id/export")
  async export(
    @Param("id") id: string,
    @Request() req: ScopedRequest,
    @Res() res: Response,
  ) {
    const allowed = [Role.QUAN_TRI_HQ, Role.CHU_CHUOI, Role.QUAN_LY_CN];
    if (!allowed.includes(req.user.role as Role)) {
      throw new ForbiddenException("Not authorised to export price books");
    }
    const buffer = await this.service.exportPriceBookToExcel(id);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="pricebook-${id}.xlsx"`);
    res.send(buffer);
  }
}

// ─── Branch Price Flag ────────────────────────────────────────────────────────

@Unscoped()
@Controller("sales/pricing/branch-flags")
export class BranchPriceFlagController {
  constructor(private readonly service: PricingService) {}

  @Post()
  set(@Body() dto: SetBranchPriceFlagDto, @Request() req: ScopedRequest) {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ can manage branch price flags");
    }
    return this.service.setBranchPriceFlag(dto, req.user.sub, req.user.role);
  }
}

// ─── Server-side price resolution (POS calls this at bill creation) ───────────

@Controller("sales/pricing/resolve")
export class PriceResolveController {
  constructor(private readonly service: PricingService) {}

  @Post()
  resolve(@Body() dto: ResolvePriceDto) {
    return this.service.resolvePrice(dto);
  }
}
