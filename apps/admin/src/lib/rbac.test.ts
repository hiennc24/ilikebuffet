/**
 * RBAC helper tests — role decode + screen access matrix.
 */
import { describe, it, expect } from "vitest";
import { decodeRole, canAccessPath } from "./rbac";

function makeToken(role: string): string {
  const payload = btoa(JSON.stringify({ role })).replace(/\+/g, "-").replace(/\//g, "_");
  return `header.${payload}.sig`;
}

describe("decodeRole", () => {
  it("reads the role claim from a JWT", () => {
    expect(decodeRole(makeToken("QUAN_LY_CN"))).toBe("QUAN_LY_CN");
  });
  it("returns null for missing/garbage tokens", () => {
    expect(decodeRole(null)).toBeNull();
    expect(decodeRole("not-a-jwt")).toBeNull();
  });
});

describe("canAccessPath", () => {
  it("allows unlisted screens for any role", () => {
    expect(canAccessPath("THU_NGAN", "/settings/pricing")).toBe(true);
    expect(canAccessPath(null, "/")).toBe(true);
  });

  it("restricts users/audit to HQ + branch manager", () => {
    expect(canAccessPath("QUAN_TRI_HQ", "/settings/users")).toBe(true);
    expect(canAccessPath("QUAN_LY_CN", "/settings/log")).toBe(true);
    expect(canAccessPath("THU_NGAN", "/settings/users")).toBe(false);
    expect(canAccessPath("THU_KHO", "/settings/log")).toBe(false);
  });

  it("restricts branches to HQ/owner", () => {
    expect(canAccessPath("QUAN_TRI_HQ", "/settings/branches")).toBe(true);
    expect(canAccessPath("QUAN_LY_CN", "/settings/branches")).toBe(false);
  });

  it("lets accountant view orders but not manage users", () => {
    expect(canAccessPath("KE_TOAN_CHUOI", "/orders")).toBe(true);
    expect(canAccessPath("KE_TOAN_CHUOI", "/settings/users")).toBe(false);
  });
});
