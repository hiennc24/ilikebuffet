# W0 — Inventory foundation

**Goal:** schema + module scaffold + FE nav for the inventory domain.

## Schema (new models + migration, additive)
- `PurchaseOrder` { id, code(unique per branch), branchId, supplierId, status
  (DRAFT|SENT|RECEIVED|CANCELLED), note?, createdBy, createdAt }.
- `PurchaseOrderLine` { id, poId, ingredientId, unitId (purchase unit), qty (Float),
  unitPriceVnd (Int), lineTotalVnd (Int) }.
- `StockMovement` { id, branchId, ingredientId, type (RECEIPT|ISSUE|ADJUST), qtyBase
  (Float, +in/−out in base unit), unitCostVnd (Int?), refType?, refId?, note?, createdBy,
  createdAt }.  @@index([branchId, ingredientId, createdAt]).
- `InventoryBalance` { branchId, ingredientId, qtyBase (Float), avgCostVnd (Int),
  updatedAt } @@id([branchId, ingredientId]).  (maintained + reconstructable from movements)
- Enums: `PoStatus`, `StockMovementType`.

## Backend
- New `inventory/` under sales or platform (chốt: `apps/api/src/inventory/`), module
  registered in AppModule. Services: `InventoryService` (balance ops), controllers per phase.
- Shared helper: apply a movement in-tx → upsert `InventoryBalance` (re-read for concurrency),
  moving-average cost on RECEIPT.

## Frontend
- Nav section "Kho" (reuse existing "Kho nguyên liệu" group → add PO / Nhập kho / Tồn kho).
- Reuse usePagedList/DataTable/Dialog/report-ui.

## Tests
- Migration applies; module wires; a smoke unit test for the movement→balance helper
  (RECEIPT adds, ISSUE subtracts, ADJUST sets delta; avg-cost math).

## Risks
- qtyBase is Float (kg/lít) — money stays Int VND; cost = roundVnd(qty×price). Never float VND.
- Balance concurrency: upsert inside tx with a row lock / re-read (like payments/refund).
