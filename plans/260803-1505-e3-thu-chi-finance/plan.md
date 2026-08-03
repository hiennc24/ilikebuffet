---
title: "E3 — Tài chính: Thu-Chi + Sổ quỹ + P&L"
slug: e3-thu-chi-finance
created: 2026-08-03
status: done
priority: P1
mode: --tdd

decisions:
  - access: gate finance by the CAPABILITY matrix (permissions.ts `can(role, cap)`)
    — not a hardcoded role set — so permissions are centralized ("màn hình phân
    quyền"). E3 is the first module to actually enforce `can()`. Caps used:
    cash:create-voucher (create), cash:read (read/report), cash:close-book (P&L).
    Adjust the matrix (+spec) so the intended roles hold them.
  - approval: over account.approvalThresholdVnd (>0) requires QUAN_LY_CN PIN
    (reuse DiscountsService.verifyApprovalPin).
  - supplier-debt: INCLUDED in E3 — payable created on goods receipt; supplier
    payment (finance EXPENSE + supplierId) applies against it; công nợ report.
  - pnl-cost: moving-average COGS (consistent with gross-margin M6).
---

# E3 — Tài chính (Thu-Chi + Sổ quỹ + Lãi/Lỗ)

Mục tiêu: ghi **phiếu thu-chi** theo tài khoản kế toán (đã có master-data), tổng
hợp **sổ quỹ/chi phí** theo kỳ/chi nhánh, và **báo cáo lãi/lỗ (P&L)** = doanh thu
thuần − giá vốn − chi phí vận hành. Khép vòng tài chính (hiện có doanh thu M3/M6 +
giá vốn M9 nhưng CHƯA có chi phí).

**Bối cảnh (đã scout):**
- `Account`{flow INCOME/EXPENSE, approvalThresholdVnd} + `AccountGroup` đã có
  (master-data), seed sẵn nhóm Thu/Chi. `approvalThresholdVnd` chú thích
  "NT-03.4 — used by TC-01" ⇒ thiết kế cho phiếu tài chính. **Chưa có** model
  giao dịch nào ghi vào account.
- `DiscountsService.verifyApprovalPin({managerId,pin,branchId,reason}, ...)` tái
  dùng được cho duyệt vượt ngưỡng (QUAN_LY_CN PIN). `PaymentMethod` (CASH/VIETQR/
  CARD) tái dùng cho phương thức chi/thu.
- Doanh thu thuần: `reports.revenue`. Giá vốn: `inventory consumption` (moving-avg,
  mặc định gross-margin).

## Phạm vi
- **Trong E3:** phiếu thu-chi (tạo + list + duyệt vượt ngưỡng), báo cáo chi phí
  theo tài khoản/kỳ, **P&L** (doanh thu − giá vốn − chi phí) theo kỳ/chi nhánh.
- **Ngoài E3 (E4):** công nợ NCC + thanh toán NCC (chỉ để `supplierId?` làm móc nối).

## Phases

| Phase | Tên | Nội dung | Phụ thuộc | Status |
|-------|-----|----------|-----------|--------|
| F0 | [Thu-Chi core](./phase-f0-thu-chi-core.md) | schema `FinancialTransaction` + migration + capability gate (`can()`) + service (tạo/duyệt vượt ngưỡng, list+tổng) + e2e | — | done |
| F1 | [FE + báo cáo chi phí](./phase-f1-fe-report.md) | màn thu-chi (list + tạo + duyệt PIN) + báo cáo chi phí theo tài khoản/kỳ + nav/rbac | F0 | done |
| F2 | [Công nợ NCC](./phase-f2-supplier-debt.md) | payable tạo khi nhập kho + thanh toán NCC (finance EXPENSE + supplierId) + báo cáo công nợ + FE | F0 | done |
| F3 | [P&L + docs](./phase-f3-pnl-docs.md) | báo cáo lãi/lỗ (doanh thu − giá vốn − chi phí) + xuất Excel + docs + full verify | F0,F1,F2 | done |

## Acceptance
- Tạo phiếu thu-chi theo account (flow snapshot); vượt `approvalThresholdVnd` →
  bắt buộc duyệt PIN quản lý; branch-scoped + audit.
- Báo cáo chi phí theo tài khoản/kỳ; P&L = doanh thu thuần − giá vốn − chi phí,
  theo kỳ/chi nhánh, xuất Excel.
- Tiền integer VND; không phá luồng hiện có. Test API/admin/shared xanh.

## Open questions (chốt trước khi code)
1. **Ai tạo phiếu thu-chi?** KE_TOAN_CHUOI + HQ/chủ + QUAN_LY_CN (theo CN)? Thu ngân
   có tạo chi quỹ nhỏ không?
2. **Duyệt vượt ngưỡng:** dùng lại approval PIN của QUAN_LY_CN khi amount >
   account.approvalThresholdVnd (>0) — xác nhận.
3. **Công nợ NCC:** tách sang E4 (chỉ giữ `supplierId?` móc nối) — xác nhận.
4. **P&L giá vốn:** dùng giá vốn TB (moving-avg, như gross-margin) hay FIFO?
