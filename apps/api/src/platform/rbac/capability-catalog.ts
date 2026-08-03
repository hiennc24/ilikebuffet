/**
 * Capability catalog — the fixed set of permissions the CODE enforces, enriched
 * with Vietnamese labels and feature grouping for the admin "Vai trò & phân quyền"
 * screen. Capabilities are NOT user-creatable (only code gates enforce them); roles
 * (DB) pick from this catalog. Keep this in sync with the `Capability` union in
 * permissions.ts — `ALL_CAPABILITIES` is asserted against it in the spec.
 */
import type { Capability } from "./permissions";

export interface CatalogAction {
  /** The capability key the code checks, e.g. "cash:create-voucher". */
  key: Capability;
  /** Vietnamese action label shown in the UI. */
  label: string;
}

export interface CapabilityGroup {
  /** Stable group key (prefix-ish), e.g. "cash". */
  key: string;
  /** Vietnamese feature label, e.g. "Tài chính". */
  label: string;
  actions: CatalogAction[];
}

/**
 * Feature groups (feature → actions). Order is the display order. Every capability
 * in the `Capability` union must appear exactly once here.
 */
export const CAPABILITY_CATALOG: CapabilityGroup[] = [
  {
    key: "system",
    label: "Cấu hình & Người dùng",
    actions: [
      { key: "chain:config:read", label: "Xem cấu hình chuỗi" },
      { key: "chain:config:write", label: "Sửa cấu hình chuỗi" },
      { key: "chain:user:manage", label: "Quản lý người dùng & vai trò" },
      { key: "audit:view", label: "Xem nhật ký" },
      { key: "device:manage", label: "Quản lý thiết bị" },
    ],
  },
  {
    key: "dashboard",
    label: "Tổng quan",
    actions: [
      { key: "chain:dashboard:read", label: "Xem tổng quan chuỗi" },
      { key: "branch:dashboard:read", label: "Xem tổng quan chi nhánh" },
      { key: "report:view", label: "Xem báo cáo" },
      { key: "report:chain-view", label: "Xem báo cáo cấp chuỗi" },
    ],
  },
  {
    key: "sales",
    label: "Ca & Bán hàng",
    actions: [
      { key: "shift:open-close", label: "Mở / đóng ca" },
      { key: "shift:assist", label: "Hỗ trợ thu ngân" },
      { key: "discount:approve", label: "Duyệt giảm giá" },
      { key: "bill:cancel", label: "Huỷ hoá đơn" },
      { key: "bill:manage", label: "Quản lý đơn/hoá đơn" },
    ],
  },
  {
    key: "cash",
    label: "Tài chính",
    actions: [
      { key: "cash:read", label: "Xem thu-chi & công nợ" },
      { key: "cash:create-voucher", label: "Tạo phiếu thu-chi" },
      { key: "cash:reconcile", label: "Đối soát" },
      { key: "cash:close-book", label: "Chốt sổ" },
      { key: "bank:reconcile", label: "Đối soát ngân hàng" },
    ],
  },
  {
    key: "inventory",
    label: "Kho & Mua hàng",
    actions: [
      { key: "inventory:read", label: "Xem kho" },
      { key: "inventory:manage", label: "Quản lý kho (nhập/xuất/kiểm)" },
      { key: "inventory:transfer", label: "Điều chuyển kho" },
      { key: "recipe:manage-chain", label: "Quản lý định mức (chuỗi)" },
      { key: "recipe:manage-branch", label: "Quản lý định mức (chi nhánh)" },
      { key: "purchase-order:create", label: "Tạo / gửi đơn mua" },
      { key: "purchase-order:approve", label: "Duyệt đơn mua" },
    ],
  },
];

/** Flat list of every catalogued capability (used to validate role assignments). */
export const ALL_CAPABILITIES: Capability[] = CAPABILITY_CATALOG.flatMap((g) => g.actions.map((a) => a.key));

/** Vietnamese label for a capability, or the raw key if uncatalogued. */
export function capabilityLabel(key: string): string {
  for (const g of CAPABILITY_CATALOG) {
    const a = g.actions.find((x) => x.key === key);
    if (a) return a.label;
  }
  return key;
}
