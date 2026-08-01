# P1 — Đơn hàng (Orders)

**Goal:** admin xem/tra cứu mọi bill (không chỉ theo ca), xem chi tiết, in lại, huỷ.

## Backend (gap)
New `GET /sales/bills` list endpoint (bills.controller/service):
- Query: `branchId?`, `from?`, `to?` (business-date range), `status?`
  (COMPLETED|CANCELLED), `q?` (bill number / temp number), `page`, `pageSize`,
  `quarantined?` (bool).
- Branch-scoping: `assertBranchAccess`/`in branchIds` (HQ = chain-wide). Reuse the
  fail-closed pattern; a cross-branch `branchId` returns [] / 403 per convention.
- Return `{ data, total }` (paginated envelope, matches platform convention).
- Read-only; no money mutation. Index check: query by `(branchId, businessDate, status)`.
- Keep existing `GET /sales/bills?shiftId=` (shift monitor) working — add the general
  list as a separate code path guarded by presence of the new params.

## Frontend
- `orders-page.tsx`: FilterBar (branch [HQ only], date range, status, search) + DataTable
  (số bill, ca, giờ tạo, khách, tổng, trạng thái, cờ quarantine) + Pagination.
- Detail drawer: lines (tên vé, SL, đơn giá, thành tiền), payments (method, amount,
  tendered/change), audit trail (create/pay/cancel), nút **In lại** (POST print-agent
  via POS? or admin reprint — see risk) and **Huỷ** (reuse `POST /sales/bills/:id/cancel`
  with manager PIN dialog — component exists in POS, port/share).

## Files
- modify `apps/api/src/sales/bills/bills.controller.ts`, `bills.service.ts`, `bills.dto.ts`
- create `apps/api/test/bill-list.e2e-spec.ts`, `bills.service.spec.ts` cases
- create `apps/admin/src/pages/orders-page.tsx` (+ test)
- reuse P0 components; add query keys

## Steps (TDD)
1. e2e/red: list filters by branch/date/status/q, paginates, branch-scoped, 403 cross-branch.
2. Implement service+controller+dto.
3. FE: list + detail + cancel flow (manager PIN) + reprint.

## Tests
- e2e: filter matrix, pagination, branch-scope denial, quarantined flag surface.
- FE: renders list, opens detail, cancel calls endpoint with PIN.

## Sub-phase P1b — Hoàn tiền (Refund) — ĐÃ CHỐT làm (nghiệp vụ tiền mới)
Schema + endpoint, tôn trọng mọi bất biến money như M1.
- **Schema** (`prisma/schema.prisma` + migration): model `Refund` { id, billId→Bill,
  amountVnd Int, method PaymentMethod, reason String, refundedBy (actor), approvedBy
  (manager), createdAt }. Cho phép refund một phần → nhiều dòng. (KHÔNG dùng Payment
  amount âm — tách bảng cho rõ đối soát.)
- **Invariant:** chỉ refund bill đã `paidAt` & `COMPLETED`; `sum(refunds.amountVnd) +
  amountVnd ≤ bill.totalVnd` (không refund quá số đã trả); amount là integer dương;
  re-read trong tx để chống double-refund đồng thời (giống payments concurrency).
- **Trạng thái:** thêm cột dẫn xuất/`refundedVnd` HOẶC set `status` = `REFUNDED` khi
  refund đủ toàn phần (chốt khi code — ưu tiên giữ COMPLETED + tổng refunds, tránh
  đổi enum status nếu không cần).
- **Endpoint:** `POST /sales/bills/:id/refund` { amountVnd, reason, managerId, pin,
  method } → verify PIN (reuse `discounts.verifyApprovalPin`, bind branch như CR-2,
  chạy trong tx như ME-2) + branch-scope (`assertBranchAccess`) + audit `bill.refund`.
- **FE:** trong detail drawer, nút "Hoàn tiền" → dialog nhập số tiền (≤ còn lại) + lý do
  + PIN quản lý; hiện lịch sử refund. Chỉ role được phép (P6).
- **Tests:** e2e — refund một phần, refund vượt số đã trả → 400, double-refund đồng thời
  chỉ 1 thắng, PIN sai/khác chi nhánh → 403, audit ghi. FE — dialog validate + gọi API.

## Risks / open
- **Reprint từ admin**: máy in là local-agent cạnh POS; admin có thể không in trực tiếp.
  MVP: chỉ hiện lại nội dung/preview; in thật để POS. Chốt khi làm.
- Refund đổi bức tranh đối soát (GA-02, M3) — đảm bảo refund vào audit + có thể truy vấn
  để báo cáo doanh thu thuần sau này.
