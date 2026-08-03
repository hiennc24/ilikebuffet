/**
 * RbacController unit tests — the matrix endpoint is static (no DB), so we call it
 * directly. Covers the role gate and that the exposed matrix matches permissions.ts.
 */
import { ForbiddenException } from "@nestjs/common";
import { RbacController } from "./rbac.controller";
import { Role } from "./role.enum";
import type { ScopedRequest } from "./branch-scope.guard";

const ctrl = new RbacController();
const req = (role: Role) => ({ user: { role } }) as unknown as ScopedRequest;

describe("RbacController", () => {
  it("returns the full role→capability matrix to HQ", () => {
    const res = ctrl.capabilities(req(Role.QUAN_TRI_HQ));
    expect(res.roles).toHaveLength(6);
    expect(res.roles.find((r) => r.value === Role.THU_NGAN)?.label).toBe("Thu ngân");
    // Known cells (match permissions.ts): cashier creates vouchers; warehouse doesn't.
    expect(res.capabilities).toContain("cash:create-voucher");
    expect(res.matrix[Role.THU_NGAN]).toContain("cash:create-voucher");
    expect(res.matrix[Role.THU_KHO]).not.toContain("cash:create-voucher");
    // Branch manager approves POs; warehouse only creates.
    expect(res.matrix[Role.QUAN_LY_CN]).toContain("purchase-order:approve");
    expect(res.matrix[Role.THU_KHO]).toContain("purchase-order:create");
    expect(res.matrix[Role.THU_KHO]).not.toContain("purchase-order:approve");
  });

  it("allows a branch manager to view", () => {
    expect(() => ctrl.capabilities(req(Role.QUAN_LY_CN))).not.toThrow();
  });

  it("forbids roles outside the user-management set", () => {
    expect(() => ctrl.capabilities(req(Role.THU_NGAN))).toThrow(ForbiddenException);
    expect(() => ctrl.capabilities(req(Role.KE_TOAN_CHUOI))).toThrow(ForbiddenException);
  });
});
