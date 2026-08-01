/**
 * SyncController — offline bill sync endpoint.
 *
 * POST /sales/bills/sync
 *   Accepts a batch of offline bills; returns full result map (never partial).
 *
 * Global guards (branch-scope + JWT) apply automatically — no @Unscoped.
 * BranchScopeGuard enforces token branchId matches request branchId.
 *
 * Role: THU_NGAN only (same as online bill create).
 * Branch scope: each bill's branchId + deviceId must match the caller's token.
 */
import { Body, Controller, ForbiddenException, Post, Request } from "@nestjs/common";
import { SyncService } from "./sync.service";
import { DiscountsService } from "../discounts/discounts.service";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { SyncBatchDto, SyncBatchResult, ForceCloseBillDto } from "./sync.dto";

@Controller("sales/bills")
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly discounts: DiscountsService,
  ) {}

  /**
   * POST /sales/bills/sync — batch offline sync.
   *
   * Always returns HTTP 200 with per-bill statuses. Partial failure returns
   * status="retry" on failed bills — the client retries those individually.
   * Never returns 4xx for individual bill failures — never rejects a sale that
   * was already printed.
   *
   * 403 is only returned if the caller's role is wrong (not THU_NGAN).
   */
  @Post("sync")
  async syncBatch(
    @Body() dto: SyncBatchDto,
    @Request() req: ScopedRequest,
  ): Promise<SyncBatchResult> {
    if (req.user.role !== Role.THU_NGAN) {
      throw new ForbiddenException("Only THU_NGAN can sync bills");
    }

    if (!dto.bills || dto.bills.length === 0) {
      return { results: [] };
    }

    const allowedBranchIds = new Set(req.user.branchIds);
    const tokenDeviceId = req.user.deviceId;

    // Process all bills; each is independent (per-bill idempotent)
    const results = await Promise.all(
      dto.bills.map((bill) =>
        this.sync.processBill(
          bill,
          req.user.sub,
          allowedBranchIds,
          { tokenDeviceId },
        ),
      ),
    );

    // Record voided-before-sync temp numbers (audit only, no bill row).
    let voidsRecorded = 0;
    if (dto.voids?.length) {
      const recorded = await Promise.all(
        dto.voids.map((v) => this.sync.recordVoid(v, req.user.sub, allowedBranchIds)),
      );
      voidsRecorded = recorded.filter(Boolean).length;
    }

    return { results, voidsRecorded };
  }

  /**
   * POST /sales/bills/force-close — accept a stuck offline bill as a
   * QUARANTINED sale, gated by a manager approval PIN, so a dead/stuck device
   * cannot block shift close and the printed paper bill is still accounted.
   */
  @Post("force-close")
  async forceClose(
    @Body() dto: ForceCloseBillDto,
    @Request() req: ScopedRequest,
  ): Promise<SyncBatchResult> {
    if (req.user.role !== Role.THU_NGAN) {
      throw new ForbiddenException("Only THU_NGAN can force-close bills");
    }

    const pinResult = await this.discounts.verifyApprovalPin(
      { managerId: dto.managerId, pin: dto.pin, reason: dto.reason, branchId: dto.branchId },
      req.user.sub,
      req.user.role,
    );
    if (!pinResult.approved) {
      throw new ForbiddenException("PIN quản lý không hợp lệ");
    }

    const result = await this.sync.processBill(
      dto,
      req.user.sub,
      new Set(req.user.branchIds),
      {
        forceQuarantine: { reason: `force_close_stuck: ${dto.reason}`, approvedBy: dto.managerId },
        tokenDeviceId: req.user.deviceId,
      },
    );
    return { results: [result] };
  }
}
