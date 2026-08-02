---
title: "M4 — Kho & Nhập hàng (Inventory)"
slug: m4-inventory
created: 2026-08-02
status: done
priority: P1
mode: --tdd

decisions:
  - negative-stock: block (on-hand cannot go below 0)
  - po-flow: simple DRAFT→SENT→RECEIVED (no approval threshold/PIN)
  - receipt-price: by purchase unit, converted to base via factorToBase
  - bom: deferred to M5
---

# M4 — Kho & Nhập hàng

Mục tiêu: quản lý mua hàng và tồn kho nguyên liệu theo chi nhánh — đơn mua (PO) →
nhập kho → tồn kho → xuất/điều chỉnh. Ghép với doanh thu M3 để tiến tới giá vốn/lãi.

**Bối cảnh:** master-data đã có `Ingredient` (base unit + purchase units + minStock),
`Unit`, `IngredientGroup`, `Supplier`, `SupplierIngredient`. Chưa có model kho nào —
domain này là **greenfield** (thêm model + migration).

**Nguyên tắc:** TDD. Server là gate; branch-scoped (THU_KHO/QL_CN theo chi nhánh; HQ/chủ
chain-wide). **Tiền integer VND** qua helpers; **số lượng có thể phân số** (kg/lít) →
qty là số thực, chi phí = `roundVnd(qty × đơn giá)`. Audit mọi thao tác ghi (nhập/xuất/
điều chỉnh). Tái dùng `usePagedList/DataTable/Dialog/report-ui`.

## Phạm vi & giới hạn
- **Trong M4:** PO, nhập kho (goods receipt), tồn kho (balance), xuất/điều chỉnh thủ
  công, tồn thấp, lịch sử chuyển động, báo cáo kho.
- **Ngoài M4 (tách sau):** **BOM/định mức + tự động trừ kho khi bán** — coupling với
  tạo bill, cần công thức món; để milestone riêng (M5).

## Phases

| Phase | Tên | Backend | Phụ thuộc | Status |
|-------|-----|---------|-----------|--------|
| W0 | [Inventory foundation](./phase-w0-foundation.md) | + schema/migration + module | — | ✅ done |
| W1 | [Đơn mua (Purchase Order)](./phase-w1-purchase-order.md) | + PO CRUD | W0 | ✅ done |
| W2 | [Nhập kho (Goods receipt)](./phase-w2-goods-receipt.md) | + receipt → movement + balance | W1 | ✅ done |
| W3 | [Tồn kho + Xuất/Điều chỉnh](./phase-w3-stock.md) | + balance view, out/adjust | W2 | ✅ done |
| W4 | [Báo cáo kho + RBAC + docs](./phase-w4-reports-hardening.md) | + valuation/low-stock | W1–W3 | ✅ done |

## Acceptance (toàn milestone)
- PO → nhập → tồn khớp: mọi StockMovement điều chỉnh `InventoryBalance` đúng dấu; balance
  = Σ movements (bất biến kiểm tra bằng e2e). Số lượng số thực; tiền integer VND.
- Branch-scoped + role-gated (THU_KHO/QL_CN theo CN; HQ chain-wide); cashier không.
- Không cho tồn âm ngoài ý muốn (xuất quá tồn → chặn/ cảnh báo — chốt Q).
- Audit mọi mutation in-tx; concurrency-safe (nhập/xuất đồng thời re-read balance trong tx).
- TDD: e2e cho PO/receipt/balance/out; FE test luồng chính. Build+lint+test xanh mọi package.

## Câu hỏi mở (chốt trước khi vào phase liên quan)
1. **Xuất quá tồn:** chặn cứng (không cho balance < 0), hay cho phép + cảnh báo (âm kho)?
2. **Duyệt PO:** cần duyệt theo ngưỡng (như `Account.approvalThresholdVnd`) hay chỉ
   DRAFT→SENT→RECEIVED không cần PIN duyệt?
3. **Đơn giá nhập:** nhập theo **đơn vị mua** (rồi quy về base qua factorToBase) hay nhập
   thẳng theo **đơn vị cơ bản**? (ảnh hưởng form + quy đổi tồn).
4. **BOM/tự trừ kho khi bán:** xác nhận **tách sang M5** (ngoài M4) đúng không?
