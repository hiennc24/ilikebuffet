---
title: "M8 — VietQR tự đối soát (Sepay webhook)"
slug: m8-vietqr-reconcile
created: 2026-08-03
status: planned
priority: P1
mode: --tdd

decisions:
  - provider: Sepay (webhook JSON, auth "Authorization: Apikey <SEPAY_API_KEY>")
  - match: auto-confirm on a UNIQUE match (amount == bill total + bill number in
    content + bill unpaid); ambiguous/none → manual-review queue
  - amount: exact-total only (partial/over → unmatched)
  - reconcile roles: chain-level (QUAN_TRI_HQ, CHU_CHUOI, KE_TOAN_CHUOI)
---

# M8 — VietQR tự đối soát

Mục tiêu: nhận webhook chuyển khoản (Sepay) → khớp bill chưa trả → **tự tạo thanh
toán VIETQR + đánh dấu đã trả**; giao dịch nhập nhằng/không khớp vào hàng chờ đối
soát thủ công. Thay việc thu ngân confirm VietQR bằng tay.

**Bối cảnh (đã scout):** Payment{method VIETQR, amountVnd, reference}; bill trả
qua PaymentsService (tổng = total, set paidAt, in-tx, audit). Branch.bankAccount
(JSON, VietQR). `@Public` bỏ auth (JwtAuthGuard + BranchScopeGuard đều skip).
ConfigService đọc env. CHƯA có model/endpoint webhook nào.

**Sepay payload (in):** { id, gateway, transactionDate, accountNumber, content,
transferType:"in", transferAmount, referenceCode, ... }. Auth header
`Authorization: Apikey <key>`. Trả 200 `{success:true}`.

**Khớp:** normalize(content) = upper + bỏ ký tự không chữ-số; số bill
"CN01-260803-0001" → "CN012608030001"; tìm bill COMPLETED chưa trả có
normalize(number) ⊂ normalize(content) VÀ totalVnd == transferAmount. Đúng 1 →
tự áp; 0 hoặc >1 → UNMATCHED.

## Bảo mật
- `SEPAY_API_KEY` từ env (KHÔNG commit; .env gitignored). Sai key → 401.
- Idempotent theo (provider, providerTxId) — Sepay retry không áp kép.
- Lưu rawPayload để audit + soi lại; chỉ xử lý transferType "in".

## Phases

| Phase | Tên | Nội dung | Phụ thuộc | Status |
|-------|-----|----------|-----------|--------|
| V0 | [Ingest](./phase-v0-ingest.md) | schema BankTransaction + migration + webhook @Public (verify Apikey, dedupe, store "in") + e2e | — | planned |
| V1 | [Match + auto-pay](./phase-v1-match.md) | khớp (amount+number) + tự tạo Payment VIETQR + paidAt in-tx + audit + e2e | V0 | planned |
| V2 | [Admin + docs](./phase-v2-admin-docs.md) | màn đối soát ngân hàng (list + khớp/bỏ qua thủ công) + docs + full verify | V0,V1 | planned |

## Acceptance
- Webhook sai/khuyết Apikey → 401; đúng → 200 {success}. Replay cùng txId không áp kép.
- Khớp duy nhất (amount+number, chưa trả) → bill.paidAt set + Payment VIETQR + audit.
- Không/nhiều khớp, sai số tiền, bill đã trả → UNMATCHED (không tự áp).
- Đối soát thủ công: khớp bill / bỏ qua; role chain-level; branch-safe.
- Không commit secret; không phá luồng thanh toán hiện có. Test API/admin xanh.
