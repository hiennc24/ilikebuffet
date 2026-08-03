# F2 — Công nợ nhà cung cấp (payable)

**Goal:** ghi nợ khi nhập kho + thanh toán NCC + báo cáo công nợ.

## Schema (additive migration)
- `SupplierPayable` { id, supplierId, branchId, poId?, amountVnd(Int),
  paidVnd(Int @default 0), status(OPEN|PAID), dueDate?, createdAt }. FK
  supplier/branch/PO. index [supplierId, status].

## Backend
- **Tạo payable khi nhập kho:** trong `GoodsReceiptService.receive` (M4/W2), cùng
  tx: tạo SupplierPayable amount = Σ lineTotal nhận, dueDate = today + supplier.debtTerms.
  (Chỉ khi PO có supplier — luôn có.)
- **Thanh toán NCC:** dùng `FinancialTransaction` EXPENSE + supplierId + (payableId?).
  `sales/finance` `paySupplier(payableId, amountVnd, method, ...)`: tạo phiếu chi +
  cộng paidVnd; nếu paidVnd>=amount → status PAID. amount ≤ (amount − paid). in-tx + audit.
- **Báo cáo công nợ:** `GET /sales/finance/payables?supplierId&status&branchId` —
  per NCC: Σ amount − Σ paid = outstanding, quá hạn (dueDate < today). Branch-scoped
  + capability `cash:read`.

## Frontend (`supplier-debt-page.tsx`)
- List payable (NCC, PO, số tiền, đã trả, còn nợ, hạn) + lọc trạng thái/NCC.
- Hành động: "Thanh toán" → dialog số tiền + phương thức → gọi paySupplier.
- Route `/finance/payables`, nav, rbac (capability).

## Tests (e2e)
- Nhập kho tạo payable đúng amount + dueDate; thanh toán một phần → paidVnd tăng,
  còn OPEN; thanh toán đủ → PAID; trả quá → 400; branch-scope; audit.

## Risks
- Tránh trùng: payable là "đã nhận hàng, chưa trả tiền"; thanh toán qua finance
  EXPENSE (account "Mua nguyên liệu") — LƯU Ý P&L (F3) dùng COGS tiêu hao, KHÔNG
  cộng lại phiếu chi mua NL vào opex (tránh đếm 2 lần). Ghi rõ.
