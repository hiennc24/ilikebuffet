---
title: "M7 — Định mức theo chi nhánh (override)"
slug: m7-branch-recipe
created: 2026-08-03
status: planned
priority: P1
mode: --tdd
---

# M7 — Định mức theo chi nhánh

Mục tiêu: cho phép **mỗi chi nhánh có định mức riêng** cho một loại vé, override
định mức chung (chain-wide) của M5. Khi bán, ưu tiên định mức của CN bill; nếu CN
chưa đặt → dùng định mức chung.

**Bối cảnh (đã scout):** `TicketTypeRecipe { ticketTypeId, ingredientId, qtyBase }`
`@@unique([ticketTypeId, ingredientId])`, chain-wide (không branchId). Tiêu hao
(`consumeForBill`) load recipe theo ticketTypeId rồi gộp. CRUD `recipes.service`
PUT thay toàn bộ recipe của 1 loại vé (deleteMany+createMany). Controller
`@Unscoped`, write HQ/chủ.

**Ngữ nghĩa override (chốt):** override **thay toàn bộ** recipe cho (CN, loại vé)
— nếu CN có bất kỳ dòng nào cho loại vé đó thì dùng trọn bộ dòng của CN; ngược lại
dùng trọn bộ dòng chung. (KISS, không merge từng nguyên liệu.)

## Thiết kế
- Thêm `branchId String?` vào `ticket_type_recipe`: null = định mức chung, non-null
  = override theo CN. Unique cũ (NULL không dedupe được) → thay bằng **2 partial
  unique index**: (ticketTypeId, ingredientId) WHERE branchId IS NULL; và
  (ticketTypeId, ingredientId, branchId) WHERE branchId IS NOT NULL. FK branchId →
  branch (scalar, không Prisma relation — theo lối Shift). Prisma schema bỏ
  `@@unique`, thêm `@@index([ticketTypeId, branchId])`; partial unique ở SQL.
- Tiêu hao: resolve theo (loại vé): branch rows nếu có, else chain rows.
- CRUD: list/set theo `branchId?` (null = chung). Set override cần quyền + phạm vi CN.

## Phases

| Phase | Tên | Nội dung | Phụ thuộc | Status |
|-------|-----|----------|-----------|--------|
| R0 | [Schema + resolve](./phase-r0-schema-resolve.md) | migration (nullable branchId + partial unique + FK) + consumption resolve (override→fallback) + e2e | — | planned |
| R1 | [CRUD + FE + docs](./phase-r1-crud-fe.md) | recipe CRUD branch-aware (list/set + access) + FE chọn phạm vi (Chung/CN) + docs + full verify | R0 | planned |

## Acceptance
- CN có override → bán trừ theo override; CN chưa đặt → dùng định mức chung (fallback).
- Đặt override chỉ khi có quyền + trong phạm vi CN; sửa định mức chung vẫn HQ/chủ.
- Không phá M5: loại vé chỉ có định mức chung → hành vi như cũ.
- Toàn bộ test API/admin/shared xanh; `balance == Σ movements` giữ nguyên.

## Open questions
- (mặc định) Ai đặt override CN: HQ/chủ + Quản lý CN (theo phạm vi CN). Xác nhận khi review.
