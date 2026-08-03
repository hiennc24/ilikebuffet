---
title: "E4 — Duyệt mua hàng (PO approval) + Công nợ nâng cao (aging)"
slug: e4-po-approval-debt-aging
created: 2026-08-03
status: in-progress
priority: P1
mode: --tdd

decisions:
  - po-approval: add APPROVED status. DRAFT →(approve)→ APPROVED →(send)→ SENT.
    A PO needs approval iff total > branch.poApprovalThresholdVnd (0 = every PO).
    Under threshold may send straight from DRAFT. Reject: APPROVED → DRAFT.
    Record approvedBy/approvedAt on the PO.
  - threshold: new branch.poApprovalThresholdVnd Int @default(0); >0 = only POs
    over it need approval; 0 = all. Editable on the branch settings screen.
  - auth: capability-only — gate PO writes on the matrix (E3-consistent). approve/
    reject need purchase-order:approve; create/update/send/cancel need
    purchase-order:create. No PIN. receive stays on INVENTORY_WRITE_ROLES.
  - aging: supplier-debt aging (chưa đến hạn / 1-30 / 31-60 / 60+ quá hạn) by
    supplier + due-soon(≤7d)/overdue list + xlsx, in the finance module (cash:read).
---

# E4 — Duyệt mua hàng + Công nợ nâng cao

Mục tiêu: chèn **bước duyệt** vào vòng đời đơn mua (đơn lớn phải được duyệt trước
khi gửi NCC), và **báo cáo tuổi nợ (aging)** cho công nợ NCC đã có từ E3.

**Bối cảnh (đã scout):**
- PO hiện tại: `DRAFT → SENT → RECEIVED/CANCELLED` (`purchase-orders.service.ts`),
  chưa có bước duyệt. Ma trận capability đã ĐỊNH NGHĨA `purchase-order:create`
  (THU_KHO) + `purchase-order:approve` (QUAN_LY_CN) nhưng CHƯA enforce — controller
  đang gate bằng `INVENTORY_WRITE_ROLES` = {THU_KHO, QUAN_LY_CN, HQ, CHU_CHUOI}.
- `SupplierPayable`{dueDate?, amountVnd, paidVnd, status} (E3) — sẵn sàng cho aging.
  `FinanceService.listPayables` đã tính outstanding + overdue.

## Phạm vi
- **Trong E4:** APPROVED status + approve/reject + send-guard + ngưỡng theo chi
  nhánh + gate capability cho PO; báo cáo aging + due-soon + xuất Excel; FE cho cả hai.
- **Ngoài E4:** thông báo/nhắc hạn tự động (email/push) — chỉ hiển thị trong app.

## Phases

| Phase | Tên | Nội dung | Phụ thuộc | Status |
|-------|-----|----------|-----------|--------|
| P0 | [PO approval backend](./phase-p0-po-approval-backend.md) | schema (APPROVED, approvedBy/At, branch threshold) + migration + matrix (+spec) + service approve/reject + send-guard + capability gate + e2e | — | planned |
| P1 | [PO approval frontend](./phase-p1-po-approval-frontend.md) | màn đơn mua: hiển thị APPROVED + nút duyệt/từ chối (theo cap) + cấu hình ngưỡng ở màn chi nhánh + tests | P0 | planned |
| P2 | [Aging backend](./phase-p2-aging-backend.md) | FinanceService.payableAging (buckets theo tuổi nợ) + due-soon list + xlsx + controller (cash:read) + e2e | — | planned |
| P3 | [Aging frontend + docs](./phase-p3-aging-frontend-docs.md) | màn tuổi nợ (buckets + sắp/quá hạn + Excel) + docs + full verify | P0,P1,P2 | planned |

## Acceptance
- Đơn mua vượt `branch.poApprovalThresholdVnd` bắt buộc APPROVED trước khi SENT;
  approve/reject gate bằng `purchase-order:approve`; approvedBy/At + audit.
- Đơn dưới ngưỡng gửi thẳng DRAFT→SENT (không đổi hành vi cũ với ngưỡng phù hợp).
- Báo cáo aging theo NCC + buckets tuổi nợ + due-soon/overdue, xuất Excel; branch-scoped.
- Tiền integer VND; không phá luồng PO/nhập kho hiện có. Test API/admin xanh.

## Risks / rollback
- **Đổi gating PO sang capability** có thể ảnh hưởng vai trò tạo PO — giữ nguyên
  tập role tạo bằng cách cấp `purchase-order:create` cho đúng 4 role đang write.
- Migration thêm enum value + cột nullable + cột Int default 0 — additive, an toàn.
