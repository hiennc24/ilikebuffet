---
title: "M10 — Multi-branch & BI chuỗi"
slug: m10-multibranch-chain-bi
created: 2026-08-03
status: done
priority: P1
mode: --tdd

decisions:
  - transfer: atomic immediate (ISSUE source + RECEIPT dest in one tx, no in-transit)
  - transfer-roles: chain-wide OR branch manager with access to BOTH branches
  - chain-dashboard: chain-wide roles only (QUAN_TRI_HQ/CHU_CHUOI/KE_TOAN_CHUOI)
  - transfer-cost: carry source moving-average cost to destination (blend at dest)
---

# M10 — Multi-branch & BI chuỗi

Mục tiêu: khai thác kiến trúc đa chi nhánh (đã có branchId + branch-scope + role
chain-wide) cho **vận hành nhiều CN**: dashboard hợp nhất chuỗi + so sánh/xếp hạng
CN, và **điều chuyển kho giữa các chi nhánh**. Nhân rộng sau pilot CN1.

**Bối cảnh (đã scout):**
- Kiến trúc multi-branch sẵn: `branchWhere(access, branchId)`, chain-wide roles
  (QUAN_TRI_HQ/CHU_CHUOI/KE_TOAN_CHUOI) thấy mọi CN.
- `reports.revenue`/`grossMargin` đã hỗ trợ `groupBy=branch`. Nhưng `dashboard()`
  chỉ **gộp** theo scope, KHÔNG tách per-branch/xếp hạng → thiếu góc nhìn chuỗi.
- Kho: `StockMovement` (RECEIPT/ISSUE/ADJUST) + `InventoryBalance` (moving-avg),
  `InventoryBalanceService.applyDelta` (chặn âm, cost theo avg). **Chưa có** điều
  chuyển liên CN.

## Phạm vi
- **Trong M10:** (X0) dashboard/BI hợp nhất chuỗi + xếp hạng CN; (X1) điều chuyển
  kho liên CN (2 chân ISSUE/RECEIPT, mang giá vốn); (X2) báo cáo so sánh CN +
  xuất Excel + docs.
- **Ngoài M10:** E3 tài chính (thu-chi/công nợ), E4 duyệt mua hàng — wave khác.

## Phases

| Phase | Tên | Nội dung | Phụ thuộc | Status |
|-------|-----|----------|-----------|--------|
| X0 | [Chain overview](./phase-x0-chain-overview.md) | endpoint hợp nhất per-branch (doanh thu/khách/chênh lệch tiền ca/tồn thấp) + màn dashboard chuỗi (chain-wide) | — | ✅ done |
| X1 | [Điều chuyển kho liên CN](./phase-x1-stock-transfer.md) | schema StockTransfer + service (ISSUE nguồn/RECEIPT đích, mang avg cost, chặn âm, access 2 đầu) + màn + e2e | — | ✅ done |
| X2 | [So sánh CN + docs](./phase-x2-compare-docs.md) | báo cáo xếp hạng CN (doanh thu/lãi gộp/chênh lệch) + xuất Excel + docs + full verify | X0 | ✅ done |

## Acceptance
- Chain owner thấy dashboard **per-branch + tổng chuỗi + xếp hạng**; branch role chỉ
  thấy CN mình (fail-closed như hiện tại).
- Điều chuyển kho: qty rời CN nguồn (chặn âm) + vào CN đích, **mang giá vốn** (avg
  nguồn → blend đích); cần quyền cả 2 CN; `balance == Σ movements` giữ nguyên; audit.
- So sánh CN + Excel; docs cập nhật. Toàn bộ test API/admin/shared xanh.

## Open questions (chốt trước khi code)
1. **Điều chuyển: tức thời hay có "hàng đang đi đường"?** Tức thời nguyên tử (ISSUE
   +RECEIPT cùng tx, đơn giản) hay DRAFT/SENT→RECEIVED (goods-in-transit, chính xác
   thời điểm nhưng phức tạp như PO)?
2. **Quyền điều chuyển:** chain-wide + Quản lý CN có quyền cả 2 CN? hay chỉ HQ/chủ?
3. **Dashboard chuỗi:** chỉ chain-wide roles (owner/HQ/kế toán-chuỗi) — xác nhận.
4. **Giá vốn khi chuyển:** mang avg cost CN nguồn sang đích (khuyến nghị) — xác nhận.
