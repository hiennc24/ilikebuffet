# F0 — Thu-Chi core

**Goal:** model + backend tạo/duyệt/list phiếu thu-chi, an toàn tiền + quyền.

## Schema (additive migration)
- `FinancialTransaction` { id, code(unique per branch), branchId, accountId,
  flow (AccountFlow snapshot), amountVnd(Int >0), method(PaymentMethod),
  occurredAt(Timestamptz), note?, supplierId?, createdBy, approvedBy?, createdAt }.
  FK branchId→branch, accountId→account, supplierId→supplier (SET NULL). Scalar FK
  kiểu Shift; index [branchId, occurredAt].

## Service (`sales/finance`)
- `create(dto, actor, role, access)`:
  - load account (tồn tại) → flow = account.flow; assertBranchAccess(branchId);
    amountVnd nguyên >0.
  - Vượt ngưỡng: nếu account.approvalThresholdVnd>0 và amountVnd>threshold →
    bắt buộc managerId+pin → `discounts.verifyApprovalPin(..., successTx)` trong tx;
    approvedBy = managerId. (FinanceModule import DiscountsService — đã ở SalesModule.)
  - Tạo phiếu (code per-branch, retry P2002) + audit `finance.create`.
- `list(query, access)`: branch-scoped; lọc flow/accountId/method/from/to; phân
  trang + totals { incomeVnd, expenseVnd, netVnd }.

## Roles (controller)
- Tạo: KE_TOAN_CHUOI + QUAN_TRI_HQ + CHU_CHUOI + QUAN_LY_CN (theo CN). (Q1)
- Xem: như trên (+ tuỳ). Branch-scoped.

## Tests (e2e)
- Tạo thu (INCOME) + chi (EXPENSE); flow snapshot đúng; branch-scope denial.
- Amount ≤ threshold → không cần PIN; > threshold → thiếu PIN 400/403, PIN đúng OK.
- list totals income/expense/net đúng; lọc theo flow/kỳ.

## Risks
- Reuse verifyApprovalPin đúng chữ ký (managerId,pin,branchId,reason). Tiền integer.
