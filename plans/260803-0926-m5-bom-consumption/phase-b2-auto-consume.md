# B2 — Tự trừ kho khi bán + hoàn khi hủy

**Goal:** ghép tiêu hao vào luồng bill (online + offline) và hoàn khi hủy.

## Hook (SalesModule import InventoryModule)
- `bills.service.create` — sau `tx.bill.create` (cùng tx): gọi
  `consumeForBill(tx, { billId, branchId, lines: resolvedLines→{ticketTypeId,qty} }, actorId)`.
- `sync.service` — sau `tx.bill.create` (cùng tx, path offline): gọi tương tự.
- `bills.service.cancelBill` — trong tx hủy: gọi `reverseForBill(tx, { billId }, actorId)`.
- Không chặn bán khi thiếu tồn (applyConsumption cho phép âm). Không đổi giá vốn TB.

## Tests (e2e)
- Tạo bill 3 vé Người lớn (định mức 0.2kg thịt) → ISSUE 0.6kg; tồn giảm; avg giữ.
- Nhiều loại vé + vé free đều trừ; gộp theo ingredient đúng.
- Thiếu tồn: bán vẫn thành công, tồn âm, có movement.
- Hủy bill → hoàn đúng lượng; gọi 2 lần (idempotent) không hoàn kép.
- Refund (một phần) KHÔNG tạo movement kho.
- Sync path: bill offline commit → cũng ghi tiêu hao.
- `balance == Σ movements` sau nhập→bán→hủy.

## Risks
- Thứ tự lock trong tx bill: counter → audit → consumption (consumption cuối, sau audit).
  Giữ đoạn khóa ngắn; consumption lock theo (branch,ingredient) — tránh deadlock bằng
  xử lý ingredient theo thứ tự id ổn định.
- Không phá test luồng bill hiện có (bill-create-snapshot, sync-scenarios): loại vé
  không có định mức → tiêu hao rỗng, không lỗi.
