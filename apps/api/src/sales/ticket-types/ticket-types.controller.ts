/**
 * TicketTypesController — ticket-type HTTP endpoints.
 *
 * Role gates:
 *   - Create / Update / Deactivate: QUAN_TRI_HQ only (@Unscoped — chain-wide config).
 *   - List / FindOne: all authenticated users.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  ForbiddenException,
  Request,
} from "@nestjs/common";
import { TicketTypesService } from "./ticket-types.service";
import { Unscoped } from "../../platform/rbac/decorators";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { CreateTicketTypeDto, UpdateTicketTypeDto, TicketTypeListQuery } from "./ticket-types.dto";

@Controller("sales/ticket-types")
export class TicketTypesController {
  constructor(private readonly service: TicketTypesService) {}

  @Unscoped()
  @Post()
  create(@Body() dto: CreateTicketTypeDto, @Request() req: ScopedRequest) {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ can manage ticket types");
    }
    return this.service.create(dto, req.user.sub, req.user.role);
  }

  @Get()
  list(@Request() req: ScopedRequest) {
    const query: TicketTypeListQuery = {};
    // Only HQ/chain-wide users see inactive ticket types.
    if (req.user.chainWide) query.includeInactive = true;
    return this.service.list(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Unscoped()
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTicketTypeDto,
    @Request() req: ScopedRequest,
  ) {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ can manage ticket types");
    }
    return this.service.update(id, dto, req.user.sub, req.user.role);
  }

  @Unscoped()
  @Delete(":id")
  deactivate(@Param("id") id: string, @Request() req: ScopedRequest) {
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new ForbiddenException("Only QUAN_TRI_HQ can manage ticket types");
    }
    return this.service.deactivate(id, req.user.sub, req.user.role);
  }
}
