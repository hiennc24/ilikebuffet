# L1 — FIFO COGS report + FE

**Goal:** endpoint FIFO COGS theo kỳ/chi nhánh (song song moving-avg) + hiển thị.

## Backend (`inventory/reports/inventory-reports.service` — thêm `fifoCogs`)
- `GET /inventory/reports/fifo-cogs?branchId&from&to` — role view + branch-scoped.
- Với mỗi (branch, ingredient) trong phạm vi:
  - Load TẤT CẢ movement (RECEIPT/ISSUE/ADJUST + BILL/BILL_REVERSAL) theo createdAt.
  - Với outflow BILL: lấy `bill.businessDate` → dayKey (join qua refId=billId; batch).
  - Gọi `fifoCogs(movements)` → cộng dồn totalCogsVnd + byDay.
- Trả { totalCogsVnd, byIngredient?[], byDay? }. So sánh với moving-avg
  (đã có ở gross-margin/consumption) — chỉ cần trả FIFO total + theo ngày.
- Lưu ý: FIFO cần replay từ đầu lịch sử để trạng thái lô đúng; chỉ cộng COGS cho
  bill có businessDate ∈ [from,to].

## Frontend
- Màn lãi gộp (hoặc thẻ tồn kho): thêm KPI "Giá vốn FIFO (kỳ)" cạnh
  "Giá vốn (ước tính, TB)" để đối chiếu. Nhãn rõ 2 phương pháp.
- Reuse useReport/KpiCard. Không thêm route mới nếu ghép được vào lãi gộp.

## Tests
- e2e: nhập 2 lô giá khác → bán → FIFO COGS khớp engine; moving-avg KHÔNG đổi.
- e2e: branch-scope; bill ngoài kỳ không tính.
- FE: KPI FIFO hiển thị từ mock.

## Docs
- `docs/project-roadmap.md`: M9 done; backlog còn carry-overs.

## Verify
- API unit+e2e xanh (inventory/reports không hồi quy). admin/shared build+test+lint xanh.
- Khẳng định moving-average + tồn hiện tại KHÔNG đổi (so sánh trước/sau).

## Risks
- Replay toàn lịch sử/ingredient: chấp nhận ở quy mô pilot; index
  (branchId,ingredientId,createdAt) đã có. Nêu giới hạn nếu dữ liệu lớn.
