# B1 — Định mức theo loại vé (CRUD)

**Goal:** quản lý định mức nguyên liệu/1 vé cho từng loại vé.

## Backend (`inventory/recipes`)
- `GET /inventory/recipes?ticketTypeId` — list định mức (join ingredient name/unit).
- `PUT /inventory/recipes/:ticketTypeId` — set toàn bộ định mức cho 1 loại vé:
  body { lines:[{ ingredientId, qtyBase }] } → deleteMany + createMany trong tx.
  Validate ingredient tồn tại; qtyBase > 0; unique ingredient/loại vé. Audit
  `recipe.updated`.
- Role gate: HQ/chủ (+ THU_KHO nếu muốn). Chain-wide (không branch-scope).

## Frontend (`ticket-recipes-page.tsx`)
- Chọn loại vé (Select) → bảng dòng định mức (ingredient + qtyBase base unit) +
  thêm/xoá dòng + lưu. Reuse Dialog/Select/DataTable. Hiển thị ĐVT cơ bản.
- Route `/inventory/recipes`, nav "Định mức", rbac entry, query-keys.

## Tests
- e2e: set định mức → GET trả đúng; thay thế toàn bộ khi PUT lại; ingredient sai → 400.
- FE: chọn loại vé, thêm dòng, lưu → PUT gọi đúng.

## Risks
- Định mức chain-wide: dùng loại vé (đã có) + nguyên liệu (đã có). Không cần branch.
