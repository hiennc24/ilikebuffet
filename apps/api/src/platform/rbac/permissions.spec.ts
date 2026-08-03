/**
 * Unit test: RBAC permission matrix.
 * Table-driven — every role × capability is explicit so any matrix change
 * causes a test failure, not silent behaviour drift.
 */
import { can, Capability } from "./permissions";
import { Role } from "./role.enum";

interface MatrixRow {
  capability: Capability;
  expected: Partial<Record<Role, boolean>>;
}

const matrix: MatrixRow[] = [
  // chain config / user management
  {
    capability: "chain:config:write",
    expected: { [Role.QUAN_TRI_HQ]: true, [Role.CHU_CHUOI]: false, [Role.KE_TOAN_CHUOI]: false, [Role.QUAN_LY_CN]: false, [Role.THU_NGAN]: false, [Role.THU_KHO]: false },
  },
  {
    capability: "chain:config:read",
    expected: { [Role.QUAN_TRI_HQ]: true, [Role.CHU_CHUOI]: true, [Role.KE_TOAN_CHUOI]: false, [Role.QUAN_LY_CN]: false, [Role.THU_NGAN]: false, [Role.THU_KHO]: false },
  },
  {
    capability: "chain:user:manage",
    expected: { [Role.QUAN_TRI_HQ]: true, [Role.CHU_CHUOI]: false, [Role.KE_TOAN_CHUOI]: false, [Role.QUAN_LY_CN]: false, [Role.THU_NGAN]: false, [Role.THU_KHO]: false },
  },
  // chain dashboard
  {
    capability: "chain:dashboard:read",
    expected: { [Role.QUAN_TRI_HQ]: true, [Role.CHU_CHUOI]: true, [Role.KE_TOAN_CHUOI]: true, [Role.QUAN_LY_CN]: false, [Role.THU_NGAN]: false, [Role.THU_KHO]: false },
  },
  // branch dashboard (own-branch for QUAN_LY_CN)
  {
    capability: "branch:dashboard:read",
    expected: { [Role.QUAN_TRI_HQ]: true, [Role.CHU_CHUOI]: true, [Role.KE_TOAN_CHUOI]: true, [Role.QUAN_LY_CN]: true, [Role.THU_NGAN]: false, [Role.THU_KHO]: false },
  },
  // shift open/close — cashier only
  {
    capability: "shift:open-close",
    expected: { [Role.QUAN_TRI_HQ]: false, [Role.CHU_CHUOI]: false, [Role.KE_TOAN_CHUOI]: false, [Role.QUAN_LY_CN]: false, [Role.THU_NGAN]: true, [Role.THU_KHO]: false },
  },
  // shift assist — manager can assist
  {
    capability: "shift:assist",
    expected: { [Role.QUAN_TRI_HQ]: false, [Role.CHU_CHUOI]: false, [Role.KE_TOAN_CHUOI]: false, [Role.QUAN_LY_CN]: true, [Role.THU_NGAN]: false, [Role.THU_KHO]: false },
  },
  // discount approve (requires approval PIN)
  {
    capability: "discount:approve",
    expected: { [Role.QUAN_TRI_HQ]: false, [Role.CHU_CHUOI]: false, [Role.KE_TOAN_CHUOI]: false, [Role.QUAN_LY_CN]: true, [Role.THU_NGAN]: false, [Role.THU_KHO]: false },
  },
  // bill cancel (requires approval PIN)
  {
    capability: "bill:cancel",
    expected: { [Role.QUAN_TRI_HQ]: false, [Role.CHU_CHUOI]: false, [Role.KE_TOAN_CHUOI]: false, [Role.QUAN_LY_CN]: true, [Role.THU_NGAN]: false, [Role.THU_KHO]: false },
  },
  // cash read — chain roles + branch manager (own-branch finance) can read (E3).
  {
    capability: "cash:read",
    expected: { [Role.QUAN_TRI_HQ]: true, [Role.CHU_CHUOI]: true, [Role.KE_TOAN_CHUOI]: true, [Role.QUAN_LY_CN]: true, [Role.THU_NGAN]: false, [Role.THU_KHO]: false },
  },
  // cash create-voucher — records a thu-chi entry (E3): chain admins + accountant
  // + branch manager + cashier (small vouchers).
  {
    capability: "cash:create-voucher",
    expected: { [Role.QUAN_TRI_HQ]: true, [Role.CHU_CHUOI]: true, [Role.KE_TOAN_CHUOI]: true, [Role.QUAN_LY_CN]: true, [Role.THU_NGAN]: true, [Role.THU_KHO]: false },
  },
  // cash reconcile
  {
    capability: "cash:reconcile",
    expected: { [Role.QUAN_TRI_HQ]: false, [Role.CHU_CHUOI]: false, [Role.KE_TOAN_CHUOI]: true, [Role.QUAN_LY_CN]: false, [Role.THU_NGAN]: false, [Role.THU_KHO]: false },
  },
  // cash close-book
  {
    capability: "cash:close-book",
    expected: { [Role.QUAN_TRI_HQ]: false, [Role.CHU_CHUOI]: false, [Role.KE_TOAN_CHUOI]: true, [Role.QUAN_LY_CN]: false, [Role.THU_NGAN]: false, [Role.THU_KHO]: false },
  },
  // inventory read
  {
    capability: "inventory:read",
    expected: { [Role.QUAN_TRI_HQ]: true, [Role.CHU_CHUOI]: true, [Role.KE_TOAN_CHUOI]: true, [Role.QUAN_LY_CN]: false, [Role.THU_NGAN]: false, [Role.THU_KHO]: true },
  },
  // inventory manage (full — THU_KHO)
  {
    capability: "inventory:manage",
    expected: { [Role.QUAN_TRI_HQ]: false, [Role.CHU_CHUOI]: false, [Role.KE_TOAN_CHUOI]: false, [Role.QUAN_LY_CN]: false, [Role.THU_NGAN]: false, [Role.THU_KHO]: true },
  },
  // purchase-order approve — branch manager + chain admins sign off orders (E4).
  {
    capability: "purchase-order:approve",
    expected: { [Role.QUAN_TRI_HQ]: true, [Role.CHU_CHUOI]: true, [Role.KE_TOAN_CHUOI]: false, [Role.QUAN_LY_CN]: true, [Role.THU_NGAN]: false, [Role.THU_KHO]: false },
  },
  // purchase-order create — the PO-write role set (warehouse + branch manager +
  // chain admins); gates create/update/send/cancel (E4).
  {
    capability: "purchase-order:create",
    expected: { [Role.QUAN_TRI_HQ]: true, [Role.CHU_CHUOI]: true, [Role.KE_TOAN_CHUOI]: false, [Role.QUAN_LY_CN]: true, [Role.THU_NGAN]: false, [Role.THU_KHO]: true },
  },
];

describe("RBAC permission matrix", () => {
  for (const row of matrix) {
    for (const [role, expectedValue] of Object.entries(row.expected)) {
      it(`can(${role}, '${row.capability}') === ${String(expectedValue)}`, () => {
        expect(can(role as Role, row.capability)).toBe(expectedValue);
      });
    }
  }

  it("unknown role returns false for any capability", () => {
    expect(can("UNKNOWN_ROLE" as Role, "chain:config:write")).toBe(false);
  });
});
