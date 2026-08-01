# P5 — Nhật ký (Audit viewer)  ✅ DONE (2026-08-02)

## Actual
- BE: `audit.controller` `GET /audit` (read-only) — role gate HQ+QL_CN, branch-scoped
  (QL_CN → `branchIds` allow-list), filters actor/action/objectType/objectId/date +
  phân trang; `audit.service.query` giờ trả `{data,total}`. Không có route ghi/xoá.
- e2e `audit-query.e2e-spec` (4): HQ thấy tất cả, QL_CN chỉ CN mình, cashier 403, filter action.
- FE `audit-page.tsx`: filters + bảng + drawer xem before/after JSON. Route `/settings/log`.
- Không lộ hash: audit không bao giờ ghi hash nên before/after an toàn. Admin 58.

---
Original below.


**Goal:** màn xem nhật ký GA-01 (append-only) có filter — phục vụ điều tra/đối soát.
Backend chưa có endpoint query (chỉ có audit-export.service).

## Backend (gap — query endpoint)
`audit.controller` + query trong `audit.service` (READ-ONLY, insider-resistant):
- `GET /audit` — filter `actorId?`, `action?`, `objectType?`, `objectId?`, `branchId?`,
  `from?`, `to?`; phân trang; sort mới nhất trước; `{data,total}`.
- Trả các cột an toàn (actor, role, action, objectType/Id, branchId, deviceId, reason,
  approvedBy, before/after JSON, createdAt). KHÔNG cho sửa/xoá (append-only đã có DB
  trigger). Không lộ dữ liệu nhạy cảm (hash) nếu có trong before/after → whitelist.
- Branch-scope (đã chốt): `QUAN_TRI_HQ` xem tất cả; `QUAN_LY_CN` chỉ xem trong chi
  nhánh mình.
- Đọc audit_log qua client **không-owner** (khớp lớp REVOKE của GA-01) — chỉ SELECT.

## Frontend
- `audit-page.tsx`: FilterBar (actor, action, objectType, branch [HQ], date range) +
  DataTable (giờ, actor+role, action, đối tượng, chi nhánh, lý do) + detail drawer xem
  before/after JSON đẹp (diff view nhẹ).
- Read-only; không có nút thao tác.

## Files
- create `apps/api/src/audit/audit.controller.ts`, thêm query vào `audit.service.ts` (+ spec)
- create `apps/api/test/audit-query.e2e-spec.ts`
- create `apps/admin/src/pages/audit-page.tsx` (+ test)

## Steps (TDD)
1. e2e/red: filter matrix, pagination, branch-scope (QL_CN giới hạn), read-only (không có
   route ghi/xoá), không lộ field nhạy cảm.
2. Implement query + controller.
3. FE viewer + before/after drawer.

## Tests
- e2e: filters, scope, whitelist field, append-only (không có endpoint mutate).
- FE: renders, filters call API, drawer shows before/after.

## Risks
- Insider-resistant: chỉ đọc, whitelist cột, tôn trọng lớp REVOKE. Không thêm bất kỳ
  đường ghi nào vào audit qua controller này.
- before/after có thể lớn → phân trang + lazy render drawer.
