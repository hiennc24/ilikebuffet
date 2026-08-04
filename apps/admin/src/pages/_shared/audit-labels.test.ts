/**
 * audit-labels tests — mapped codes render Vietnamese; unmapped codes fall back to
 * a readable "<verb> <entity>" or a de-slugged string (never a raw key).
 */
import { describe, it, expect } from "vitest";
import { describeAction, describeObject } from "./audit-labels";

describe("describeAction", () => {
  it("maps known action codes to Vietnamese", () => {
    expect(describeAction("role.create")).toBe("Tạo vai trò");
    expect(describeAction("role.delete")).toBe("Xoá vai trò");
    expect(describeAction("user.create")).toBe("Tạo tài khoản");
    expect(describeAction("purchase_order.approved")).toBe("Duyệt đơn mua");
    expect(describeAction("auth.login_failed")).toBe("Đăng nhập thất bại");
  });

  it("falls back to verb + entity for an unmapped code", () => {
    // supplier is a known entity; a novel verb still yields readable text.
    expect(describeAction("supplier.create")).toBe("Tạo nhà cung cấp");
    // Fully unknown → de-slugged, never the raw dotted key.
    const out = describeAction("widget.frobnicate");
    expect(out).not.toBe("widget.frobnicate");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("describeObject", () => {
  it("maps object types to Vietnamese nouns", () => {
    expect(describeObject("role")).toBe("Vai trò");
    expect(describeObject("app_user")).toBe("Tài khoản");
    expect(describeObject("supplier")).toBe("Nhà cung cấp");
    expect(describeObject("purchase_order")).toBe("Đơn mua");
  });
});
