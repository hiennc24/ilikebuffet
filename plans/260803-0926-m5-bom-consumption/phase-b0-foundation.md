# B0 — Foundation

**Goal:** schema định mức + đường tiêu hao (allow-negative, giá vốn giữ nguyên).

## Schema (additive migration)
- `TicketTypeRecipe` { id, ticketTypeId, ingredientId, qtyBase (Decimal(12,4), /1 vé),
  createdAt } `@@unique([ticketTypeId, ingredientId])`. Relations → TicketType,
  Ingredient (+ back-refs). Chain-wide (không branchId).

## Balance service
- Thêm `applyConsumption(tx, { branchId, ingredientId, deltaQtyBase (signed),
  refType, refId, note, createdBy })`:
  - Lock row (INSERT ON CONFLICT + FOR UPDATE, như applyDelta).
  - newQty = round(oldQty + delta) — **KHÔNG chặn âm** (định mức ước tính).
  - avg **giữ nguyên** (tiêu hao/hoàn định giá theo avg hiện tại).
  - type = delta<0 ? ISSUE : RECEIPT; unitCostVnd = oldAvg.
  - Khác `applyDelta`: applyDelta chặn âm + trộn avg khi RECEIPT (mua). Tách rõ.

## RecipeConsumptionService (inventory)
- `consumeForBill(tx, { billId, branchId, lines:[{ticketTypeId, qty}] }, actorId)`:
  - Load recipes cho các ticketTypeId; gộp theo ingredient: Σ recipe.qtyBase × qty.
  - Mỗi ingredient: applyConsumption(delta = −tổng, refType "BILL", refId billId).
  - Không audit từng dòng (bill.create đã audit; ledger là bằng chứng).
- `reverseForBill(tx, { billId }, actorId)`:
  - Idempotent: nếu đã có movement refType "BILL_REVERSAL" cho billId → bỏ qua.
  - Lấy movement refType "BILL" refId billId (type ISSUE) → hoàn từng cái:
    applyConsumption(delta = +|qtyBase|, refType "BILL_REVERSAL", refId billId).

## Module wiring
- Export `RecipeConsumptionService` từ InventoryModule (SalesModule sẽ import ở B2).
- Không tạo vòng phụ thuộc (Inventory không import Sales).

## Tests
- unit: applyConsumption cho tồn âm (không throw); avg giữ nguyên; ISSUE/RECEIPT theo dấu.
- unit/e2e: consumeForBill gộp đúng nhiều vé; reverseForBill idempotent + hoàn đúng.

## Risks
- qtyBase định mức nhỏ (0.x) — Decimal(12,4); round tiêu hao về 3 số khi ghi ledger.
- Tách applyConsumption vs applyDelta rõ ràng để không phá luồng nhập/xuất M4.
