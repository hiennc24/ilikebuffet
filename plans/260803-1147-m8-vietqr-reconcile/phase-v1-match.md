# V1 — Khớp + tự áp thanh toán

**Goal:** khớp giao dịch với bill chưa trả và tự tạo payment VIETQR.

## Match + apply (`bank-reconcile.service`)
- `tryMatch(tx, bankTx)`:
  - normalize(s) = s.toUpperCase().replace(/[^A-Z0-9]/g, "").
  - Ứng viên: bill COMPLETED, paidAt null, totalVnd == bankTx.amountVnd,
    normalize(number) ⊂ normalize(bankTx.content). (query hẹp theo amount trước.)
  - Đúng 1 ứng viên → apply; else để UNMATCHED.
- `applyPayment(tx, bill, bankTx)` (in cùng tx ingest):
  - re-read bill (paidAt null) chống đua; tạo Payment{method VIETQR,
    amountVnd=total, reference=referenceCode ?? providerTxId}; set bill.paidAt.
  - BankTransaction → MATCHED + matchedBillId + branchId=bill.branchId.
  - Audit `bill.pay` actor "system:sepay" + `bank.reconcile.auto`.
- Manual: `matchToBill(bankTxId, billId, actor, access)` — dùng lại applyPayment
  (validate amount==total, bill chưa trả, quyền). `ignore(bankTxId, note)`.

## Tests (e2e)
- Khớp duy nhất → bill.paidAt set + 1 Payment VIETQR + BankTx MATCHED.
- Sai số tiền → UNMATCHED, bill chưa trả.
- 2 bill cùng số tiền + số bill khớp cả hai (dựng nhập nhằng) → UNMATCHED.
- Bill đã trả → UNMATCHED.
- Replay webhook đã MATCHED → không tạo payment thứ 2.
- Manual match: áp đúng; sai số tiền → 400; bill đã trả → 409.

## Risks
- Đua thanh toán (manual + webhook): re-read paidAt trong tx; unique không cần
  nhưng guard paidAt là chính.
- normalize số bill: đảm bảo format "CNxx-YYMMDD-NNNN" khớp nội dung viết liền.
