/**
 * SyncController — P8 offline bill sync endpoint (BH-05).
 *
 * POST /sales/bills/sync
 *   Accepts a batch of offline bills; returns full result map (C5).
 *
 * Global guards (branch-scope + JWT) apply automatically — no @Unscoped.
 * BranchScopeGuard enforces token branchId matches request branchId.
 *
 * Role: THU_NGAN only (same as online bill create).
 * C1: each bill's branchId + deviceId must match the caller's token.
 */
import { Body, Controller, ForbiddenException, Post, Request } from "@nestjs/common";
import { SyncService } from "./sync.service";
import { Role } from "../../platform/rbac/role.enum";
import type { ScopedRequest } from "../../platform/rbac/branch-scope.guard";
import type { SyncBatchDto, SyncBatchResult } from "./sync.dto";

@Controller("sales/bills")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /**
   * POST /sales/bills/sync — batch offline sync.
   *
   * Always returns HTTP 200 with per-bill statuses. Partial failure returns
   * status="retry" on failed bills — the client retries those individually.
   * Never returns 4xx for individual bill failures (C5: never reject a sale
   * already printed).
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

    // Process all bills; each is independent (per-bill idempotent, C5)
    const results = await Promise.all(
      dto.bills.map((bill) =>
        this.sync.processBill(
          bill,
          req.user.sub,
          allowedBranchIds,
        ),
      ),
    );

    return { results };
  }
}
