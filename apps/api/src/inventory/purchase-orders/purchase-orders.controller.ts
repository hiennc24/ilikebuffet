/**
 * PurchaseOrdersController — purchase-order HTTP endpoints under
 * /inventory/purchase-orders. Branch-scoped (no @Unscoped): BranchScopeGuard
 * enforces membership when a branchId travels in the body/query; :id routes are
 * re-checked against the order's branch in the service.
 *
 * Write role gate: INVENTORY_WRITE_ROLES. Read: any authenticated branch member
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
import { INVENTORY_WRITE_ROLES } from "../inventory-roles";
import { Role } from "../../platform/rbac/role.enum";
import { can, type Capability } from "../../platform/rbac/permissions";
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
  ) {}

  @Get()
  list(@Query() query: PurchaseOrderListQuery, @Request() req: ScopedRequest) {
    return this.service.list(query, access(req));
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Request() req: ScopedRequest) {
    return this.service.findOne(id, access(req));
  }

  @Post()
  create(@Body() dto: CreatePurchaseOrderDto, @Request() req: ScopedRequest) {
    requireCap(req, "purchase-order:create");
    return this.service.create(dto, req.user.sub, req.user.role, access(req));
  }

  @Put(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @Request() req: ScopedRequest,
  ) {
    requireCap(req, "purchase-order:create");
    return this.service.update(id, dto, req.user.sub, req.user.role, access(req));
  }

  @Post(":id/approve")
  approve(@Param("id") id: string, @Request() req: ScopedRequest) {
    requireCap(req, "purchase-order:approve");
    return this.service.approve(id, req.user.sub, req.user.role, access(req));
  }

  @Post(":id/reject")
  reject(@Param("id") id: string, @Request() req: ScopedRequest) {
    requireCap(req, "purchase-order:approve");
    return this.service.reject(id, req.user.sub, req.user.role, access(req));
  }

  @Post(":id/send")
  send(@Param("id") id: string, @Request() req: ScopedRequest) {
    requireCap(req, "purchase-order:create");
    return this.service.send(id, req.user.sub, req.user.role, access(req));
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Request() req: ScopedRequest) {
    requireCap(req, "purchase-order:create");
    return this.service.cancel(id, req.user.sub, req.user.role, access(req));
  }

  @Post(":id/receive")
  receive(@Param("id") id: string, @Body() dto: ReceiveGoodsDto, @Request() req: ScopedRequest) {
    // Goods receipt is a warehouse action — kept on the inventory-write role set.
    if (!INVENTORY_WRITE_ROLES.has(req.user.role as Role)) {
      throw new ForbiddenException("Không có quyền thao tác kho");
    }
    return this.receipts.receive(id, dto, req.user.sub, req.user.role, access(req));
  }
}

function access(req: ScopedRequest) {
  return { chainWide: req.user.chainWide, branchIds: req.user.branchIds };
}

function requireCap(req: ScopedRequest, capability: Capability) {
  if (!can(req.user.role as Role, capability)) {
    throw new ForbiddenException("Không có quyền thao tác đơn mua");
  }
}
