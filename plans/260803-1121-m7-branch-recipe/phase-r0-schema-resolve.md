# R0 — Schema + resolve tiêu hao

**Goal:** thêm branchId nullable + partial unique + FK; tiêu hao ưu tiên override.

## Schema (additive migration)
- `ticket_type_recipe` + `branchId String?` (null = chung, non-null = override CN).
- DROP unique cũ `ticket_type_recipe_ticketTypeId_ingredientId_key`.
- 2 partial unique index:
  - `ttr_chain_unique` (ticketTypeId, ingredientId) WHERE branchId IS NULL.
  - `ttr_branch_unique` (ticketTypeId, ingredientId, branchId) WHERE branchId IS NOT NULL.
- `@@index([ticketTypeId, branchId])`; FK branchId → branch ON DELETE CASCADE.
- Prisma schema: bỏ `@@unique`, thêm `branchId String?` + `@@index`. Partial unique
  chỉ ở SQL (Prisma không diễn đạt được; hand-written migrate, dùng migrate deploy).

## Resolve (recipe-consumption.service `consumeForBill`)
- Load rows: where { ticketTypeId in ids, OR: [{branchId: null}, {branchId: input.branchId}] }.
- Per loại vé: branchRows nếu có, else chainRows → gộp Σ qtyBase × vé.
- Không đổi phần ghi movement/allow-negative/avg.

## Tests (e2e, mở rộng recipe-consumption)
- CN có override (0.3 thịt) + chung (0.2) → bán trừ 0.3 (override thắng).
- CN khác không override → dùng 0.2 (fallback chung).
- Loại vé chỉ có chung → như M5.
- Partial unique: 2 dòng chung trùng (tt, ing) bị chặn; chung + override cùng (tt, ing) OK.

## Risks
- Prisma schema (không @@unique) vs DB (partial unique) — drift chỉ hiện với migrate
  dev (không dùng). Ghi chú comment invariant.
