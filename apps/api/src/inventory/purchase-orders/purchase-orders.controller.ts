/**
 * PurchaseOrdersController — purchase-order HTTP endpoints under
 * /inventory/purchase-orders. Branch-scoped (no @Unscoped): BranchScopeGuard
 * enforces membership when a branchId travels in the body/query; :id routes are
 * re-checked against the order's branch in the service.
 *
 * Write role gate: inventory:manage capability. Read: any authenticated branch member
 * (scope still filters rows to their branches).
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
} from "@nestjs/common";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { GoodsReceiptService } from "../receipts/goods-receipt.service";
import { PermissionService } from "../../platform/rbac/permission.service";
import type { Capability } from "../../platform/rbac/permissions";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderListQuery,
} from "./purchase-orders.dto";
import { ReceiveGoodsDto } from "../receipts/goods-receipt.dto";

@Controller("inventory/purchase-orders")
export class PurchaseOrdersController {
  constructor(
    private readonly service: PurchaseOrdersService,
    private readonly receipts: GoodsReceiptService,
    private readonly perms: PermissionService,
  ) {}

  private async requireCap(req: ScopedRequest, capability: Capability) {
    if (!(await this.perms.can(req.user.role, capability))) {
      throw new ForbiddenException("Không có quyền thao tác đơn mua");
    }
  }

  @Get()
  list(@Query() query: PurchaseOrderListQuery, @Request() req: ScopedRequest) {
    return this.service.list(query, access(req));
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.findOne(id, access(req));
  }

  @Post()
  async create(@Body() dto: CreatePurchaseOrderDto, @Request() req: ScopedRequest) {
    await this.requireCap(req, "purchase-order:create");
    return this.service.create(dto, req.user.sub, req.user.role, access(req));
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @Request() req: ScopedRequest,
  ) {
    await this.requireCap(req, "purchase-order:create");
    return this.service.update(id, dto, req.user.sub, req.user.role, access(req));
  }

  @Post(":id/approve")
  async approve(@Param("id") id: string, @Request() req: ScopedRequest) {
    await this.requireCap(req, "purchase-order:approve");
    return this.service.approve(id, req.user.sub, req.user.role, access(req));
  }

  @Post(":id/reject")
  async reject(@Param("id") id: string, @Request() req: ScopedRequest) {
    await this.requireCap(req, "purchase-order:approve");
    return this.service.reject(id, req.user.sub, req.user.role, access(req));
  }

  @Post(":id/send")
  async send(@Param("id") id: string, @Request() req: ScopedRequest) {
    await this.requireCap(req, "purchase-order:create");
    return this.service.send(id, req.user.sub, req.user.role, access(req));
  }

  @Post(":id/cancel")
  async cancel(@Param("id") id: string, @Request() req: ScopedRequest) {
    await this.requireCap(req, "purchase-order:create");
    return this.service.cancel(id, req.user.sub, req.user.role, access(req));
  }

  @Post(":id/receive")
  async receive(@Param("id") id: string, @Body() dto: ReceiveGoodsDto, @Request() req: ScopedRequest) {
    // Goods receipt is a warehouse action — gated to inventory:manage.
    if (!(await this.perms.can(req.user.role, "inventory:manage"))) {
      throw new ForbiddenException("Không có quyền thao tác kho");
    }
    return this.receipts.receive(id, dto, req.user.sub, req.user.role, access(req));
  }
}

function access(req: ScopedRequest) {
  return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
}
