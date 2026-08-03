# R1 — CRUD branch-aware + FE + docs

**Goal:** quản lý định mức chung/CN + màn chọn phạm vi; docs; full verify.

## Backend (`inventory/recipes`)
- `GET /inventory/recipes?ticketTypeId&branchId` — list rows theo scope
  (branchId null = chung; có branchId = override CN đó).
- `PUT /inventory/recipes/:ticketTypeId?branchId=` — thay toàn bộ recipe cho scope:
  deleteMany({ticketTypeId, branchId: branchId ?? null}) + createMany (kèm branchId).
  - branchId có: assertBranchAccess(access, branchId) + branch tồn tại; quyền =
    HQ/chủ hoặc QUAN_LY_CN (theo phạm vi CN).
  - branchId null (chung): HQ/chủ.
- Controller @Unscoped: đọc access từ req, truyền vào service (service tự assert khi
  có branchId — giống pattern shifts keyless).

## Frontend (`ticket-recipes-page`)
- Thêm chọn phạm vi: "Chung (mọi CN)" hoặc chọn CN (chain-wide thấy list branches;
  QUAN_LY_CN mặc định CN của mình). Load + lưu recipe theo scope đã chọn.
- Gợi ý: nếu CN chưa có override → hiển thị "đang dùng định mức chung".

## Tests
- e2e: set override CN + list theo scope; access denial khi set CN ngoài phạm vi.
- FE: đổi phạm vi → GET đúng branchId; lưu → PUT kèm branchId.

## Docs
- `docs/project-roadmap.md`: M7 done; backlog còn giá vốn thực, VietQR.

## Verify
- API unit+e2e xanh (recipes + consumption không hồi quy). admin/shared build+test+lint xanh.

## Risks
- Controller @Unscoped nhưng cần branch-scope khi set override → assert trong service.
