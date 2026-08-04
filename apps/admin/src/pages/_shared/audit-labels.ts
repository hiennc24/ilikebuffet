/**
 * Vietnamese display labels for audit-log codes (Nhật ký).
 *
 * The backend stores machine keys (e.g. "role.create", objectType "app_user").
 * These maps turn them into human text. `describeAction`/`describeObject` fall
 * back to a readable "<verb> <entity>" or a de-slugged string for any key not
 * explicitly mapped, so a new backend action never renders as a raw key.
 */

/** Full action code → Vietnamese phrase. */
export const ACTION_LABELS: Record<string, string> = {
  "account.create": "Tạo tài khoản kế toán",
  "account.update": "Cập nhật tài khoản kế toán",
  "account_group.create": "Tạo nhóm tài khoản",
  "approval_pin.branch_mismatch": "PIN duyệt sai chi nhánh",
  "approval_pin.cancelled": "Huỷ duyệt bằng PIN",
  "approval_pin.locked_attempt": "PIN duyệt bị khoá",
  "approval_pin.verified": "Duyệt bằng PIN thành công",
  "approval_pin.wrong": "Nhập sai PIN duyệt",
  "auth.login_failed": "Đăng nhập thất bại",
  "auth.pin_login_failed": "Đăng nhập PIN thất bại",
  "bank.reconcile": "Đối soát ngân hàng",
  "bank.reconcile.ignore": "Bỏ qua giao dịch ngân hàng",
  "bill.cancel": "Huỷ hoá đơn",
  "bill.cancel_denied": "Từ chối huỷ hoá đơn",
  "bill.create": "Tạo hoá đơn",
  "bill.force_close": "Đóng hoá đơn bắt buộc",
  "bill.pay": "Thanh toán hoá đơn",
  "bill.quarantine_resolved": "Xử lý hoá đơn cách ly",
  "bill.refund": "Hoàn tiền hoá đơn",
  "bill.sync_rejected": "Từ chối đồng bộ hoá đơn",
  "bill.void_before_sync": "Huỷ hoá đơn trước đồng bộ",
  "branch.create": "Tạo chi nhánh",
  "branch.status_change": "Đổi trạng thái chi nhánh",
  "branch.update": "Cập nhật chi nhánh",
  "branch_price_flag.set": "Đặt cờ giá chi nhánh",
  "cross_branch_denied": "Từ chối truy cập chéo chi nhánh",
  "discount_program.create": "Tạo chương trình giảm giá",
  "discount_program.deactivate": "Ngừng chương trình giảm giá",
  "discount_program.update": "Cập nhật chương trình giảm giá",
  "discount_reason.create": "Tạo lý do giảm giá",
  "finance.create": "Tạo phiếu thu-chi",
  "finance.supplier-pay": "Thanh toán nhà cung cấp",
  "holiday_calendar.create": "Tạo lịch lễ",
  "holiday_calendar.entries_upsert": "Cập nhật ngày lễ",
  "ingredient.create": "Tạo nguyên liệu",
  "ingredient.deactivate": "Ngừng nguyên liệu",
  "ingredient.update": "Cập nhật nguyên liệu",
  "ingredient_group.create": "Tạo nhóm nguyên liệu",
  "ingredient_group.update": "Cập nhật nhóm nguyên liệu",
  "price_book_version.create": "Tạo phiên bản bảng giá",
  "price_cell.upsert": "Cập nhật ô giá",
  "purchase_order.approved": "Duyệt đơn mua",
  "purchase_order.cancelled": "Huỷ đơn mua",
  "purchase_order.created": "Tạo đơn mua",
  "purchase_order.rejected": "Từ chối đơn mua",
  "purchase_order.sent": "Gửi đơn mua",
  "purchase_order.updated": "Cập nhật đơn mua",
  "recipe.updated": "Cập nhật định mức",
  "role.create": "Tạo vai trò",
  "role.delete": "Xoá vai trò",
  "role.set-capabilities": "Cập nhật quyền vai trò",
  "role.update": "Cập nhật vai trò",
  "shift.close": "Đóng ca",
  "shift.force_close": "Đóng ca bắt buộc",
  "shift.open": "Mở ca",
  "stock.adjust": "Điều chỉnh tồn kho",
  "stock.issue": "Xuất kho",
  "stock.receipt": "Nhập kho",
  "stock.transfer": "Điều chuyển kho",
  "supplier.approve": "Duyệt nhà cung cấp",
  "supplier.create": "Tạo nhà cung cấp",
  "supplier.deactivate": "Ngừng nhà cung cấp",
  "supplier.update": "Cập nhật nhà cung cấp",
  "ticket_type.create": "Tạo loại vé",
  "ticket_type.deactivate": "Ngừng loại vé",
  "ticket_type.update": "Cập nhật loại vé",
  "time_window.create": "Tạo khung giờ",
  "time_window.update": "Cập nhật khung giờ",
  "unit.create": "Tạo đơn vị",
  "user.create": "Tạo tài khoản",
  "user.update": "Cập nhật tài khoản",
  "user.reset_password": "Đặt lại mật khẩu",
  "user.reset_approval_pin": "Đặt lại PIN duyệt",
  "user.reset_cashier_pin": "Đặt lại PIN thu ngân",
  "user.lock": "Khoá tài khoản",
  "user.unlock": "Mở khoá tài khoản",
  "voucher.redeemed": "Sử dụng voucher",
};

/** objectType code → Vietnamese noun. */
export const OBJECT_LABELS: Record<string, string> = {
  account: "Tài khoản kế toán",
  account_group: "Nhóm tài khoản",
  app_user: "Tài khoản",
  user: "Tài khoản",
  bank_transaction: "Giao dịch ngân hàng",
  bill: "Hoá đơn",
  branch: "Chi nhánh",
  branch_price_flag: "Cờ giá chi nhánh",
  device: "Thiết bị",
  discount_program: "Chương trình giảm giá",
  discount_reason: "Lý do giảm giá",
  financial_transaction: "Phiếu thu-chi",
  holiday_calendar: "Lịch lễ",
  ingredient: "Nguyên liệu",
  ingredient_group: "Nhóm nguyên liệu",
  price_book_version: "Bảng giá",
  price_cell: "Ô giá",
  purchase_order: "Đơn mua",
  role: "Vai trò",
  shift: "Ca",
  stock_transfer: "Điều chuyển kho",
  supplier: "Nhà cung cấp",
  supplier_payable: "Công nợ NCC",
  ticket_type: "Loại vé",
  time_window: "Khung giờ",
  unit: "Đơn vị",
};

/** Role code → Vietnamese label (for the actor column). */
export const ROLE_LABELS: Record<string, string> = {
  QUAN_TRI_HQ: "Quản trị HQ",
  CHU_CHUOI: "Chủ chuỗi",
  KE_TOAN_CHUOI: "Kế toán chuỗi",
  QUAN_LY_CN: "Quản lý CN",
  THU_NGAN: "Thu ngân",
  THU_KHO: "Thủ kho",
};

const VERBS: Record<string, string> = {
  create: "Tạo", created: "Tạo", update: "Cập nhật", updated: "Cập nhật",
  delete: "Xoá", deleted: "Xoá", deactivate: "Ngừng", approve: "Duyệt",
  approved: "Duyệt", rejected: "Từ chối", cancelled: "Huỷ", cancel: "Huỷ",
  sent: "Gửi", open: "Mở", close: "Đóng", issue: "Xuất", receipt: "Nhập",
  transfer: "Điều chuyển", adjust: "Điều chỉnh", set: "Đặt",
};

const prettify = (s: string) => s.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Human phrase for an action code, with an entity+verb fallback. */
export function describeAction(action: string): string {
  const mapped = ACTION_LABELS[action];
  if (mapped) return mapped;
  const dot = action.indexOf(".");
  if (dot > 0) {
    const entity = action.slice(0, dot);
    const verb = action.slice(dot + 1);
    const entityLabel = OBJECT_LABELS[entity];
    const verbLabel = VERBS[verb];
    if (entityLabel && verbLabel) return `${verbLabel} ${entityLabel.toLowerCase()}`;
  }
  return prettify(action);
}

/** Vietnamese noun for an objectType (falls back to a de-slugged string). */
export const describeObject = (objectType: string): string => OBJECT_LABELS[objectType] ?? prettify(objectType);
