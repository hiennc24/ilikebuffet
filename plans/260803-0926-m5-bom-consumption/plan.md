---
title: "M5 — Định mức món (BOM) & tự trừ kho khi bán"
slug: m5-bom-consumption
created: 2026-08-03
status: planned
priority: P1
mode: --tdd
---

# M5 — Định mức (BOM) & tự trừ kho khi bán

Mục tiêu: mỗi **loại vé** có định mức tiêu hao nguyên liệu (ước tính/1 vé); khi bán
(tạo bill) tự trừ kho theo `Σ định mức × số vé`, hủy bill thì hoàn kho. Khép vòng
kho: nhập (M4) → bán trừ (M5) → tồn/giá vốn. Nền tảng cho báo cáo giá vốn/lãi gộp.

**Bối cảnh (đã scout):** bill thuần theo **loại vé** (BillLine → ticketTypeId, qty),
KHÔNG có model "món/dish". Vậy BOM = **định mức nguyên liệu theo loại vé**. Điểm
hook: `bills.service.create` (~L120) và `sync.service` (~L221) đều tạo bill
COMPLETED trong 1 tx; `bills.service.cancelBill` (~L209) đổi CANCELLED trong tx.
`InventoryBalanceService.applyDelta` **chặn tồn âm** — đúng cho xuất thủ công,
nhưng bán không được chặn (định mức là ước tính) → cần đường "consume" cho phép âm.

**Nguyên tắc:** TDD. Server là gate; branch-scoped. Tiền integer VND; số lượng phân
số. Tiêu hao ghi vào **ledger StockMovement** (refType "BILL") — bất biến
`balance == Σ movements` giữ nguyên. Hoàn kho dựa trên **movement đã ghi** (không
tính lại từ định mức, an toàn khi định mức đổi giữa lúc bán và hủy). Tái dùng
`usePagedList/DataTable/Dialog/report-ui`.

## Phạm vi & giới hạn
- **Trong M5:** định mức theo loại vé (CRUD), tự trừ kho khi tạo bill (online +
  offline sync), hoàn kho khi hủy bill, cho phép tồn âm khi bán (+cảnh báo), báo
  cáo tiêu hao/giá vốn theo kỳ.
- **Ngoài M5:** định mức theo chi nhánh (override), lãi gộp đầy đủ ghép doanh thu
  (M6), VietQR auto-reconcile.

## Phases

| Phase | Tên | Nội dung | Phụ thuộc | Status |
|-------|-----|----------|-----------|--------|
| B0 | [Foundation](./phase-b0-foundation.md) | schema `TicketTypeRecipe` + migration + `applyConsumption` (allow-negative, avg giữ nguyên) + `RecipeConsumptionService` + export | — | planned |
| B1 | [Định mức CRUD](./phase-b1-recipe-crud.md) | recipe CRUD backend + màn "Định mức theo loại vé" | B0 | planned |
| B2 | [Tự trừ/hoàn kho](./phase-b2-auto-consume.md) | hook consume vào create + sync; reverse khi hủy; e2e | B0 | planned |
| B3 | [Báo cáo + docs](./phase-b3-report-hardening.md) | báo cáo tiêu hao/giá vốn theo kỳ + docs + full verify | B1,B2 | planned |

## Acceptance (toàn milestone)
- Tạo bill (online + sync) tự ghi ISSUE tiêu hao đúng `Σ định mức × qty`, gồm vé free.
- Thiếu tồn KHÔNG chặn bán; tồn có thể âm; giá vốn TB không đổi khi tiêu hao.
- Hủy bill hoàn đúng lượng đã trừ (idempotent, dựa movement); refund tiền KHÔNG đổi kho.
- Định mức CRUD branch-agnostic (chain-wide), server-gated (HQ/chủ + THU_KHO?).
- `balance == Σ movements` sau chuỗi nhập→bán→hủy. Báo cáo tiêu hao khớp ledger.
- Toàn bộ test API/admin/shared xanh; không phá luồng bán M1.

## Open questions (chốt trước khi code)
1. **Cấp định mức:** chain-wide theo loại vé (đơn giản) hay theo chi nhánh (override)?
2. **Thiếu tồn khi bán:** cho phép tồn âm + cảnh báo (không chặn bán) hay chặn?
3. **Hoàn kho:** hủy bill → hoàn kho; refund (một phần) → KHÔNG đổi kho. Đúng không?
4. (mặc định) Vé miễn phí vẫn trừ kho (khách vẫn ăn) — xác nhận.
