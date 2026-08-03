# V0 — Ingest webhook

**Goal:** nhận + lưu giao dịch ngân hàng an toàn, idempotent.

## Schema (additive migration)
- `BankTransaction` { id, provider @default("sepay"), providerTxId, gateway?,
  accountNumber?, amountVnd (Int), content, referenceCode?, transferredAt,
  status (UNMATCHED|MATCHED|IGNORED) @default(UNMATCHED), matchedBillId?,
  branchId?, note?, rawPayload (Json), receivedAt @default(now()) }.
  `@@unique([provider, providerTxId])`, `@@index([status, receivedAt])`.
- enum `BankTxStatus`.

## Module (`sales/bank-reconcile`)
- `webhook.controller.ts`: `@Public() POST /webhooks/sepay`. Verify header
  `Authorization: Apikey <SEPAY_API_KEY>` (ConfigService) — sai → 401. Body =
  SepayWebhookDto (khai báo đủ field Sepay để không bị ValidationPipe strip).
- `bank-reconcile.service.ts` `ingest(payload)`:
  - Bỏ qua nếu transferType != "in" (trả success, không lưu).
  - Upsert theo (provider, providerTxId): đã có → trả (idempotent, không xử lý lại).
  - Tạo BankTransaction (rawPayload = body). Gọi match ở V1 (V0: chỉ lưu UNMATCHED).
  - Trả { success: true }.

## Env
- `.env(.example)`: `SEPAY_API_KEY=`. KHÔNG commit giá trị thật.

## Tests (e2e, AppModule HTTP)
- Thiếu/sai Apikey → 401. Đúng key → 201/200 {success}.
- transferType "out" → success nhưng không tạo row.
- Replay cùng id → chỉ 1 row (idempotent).

## Risks
- ValidationPipe whitelist strip field lạ → khai báo đủ field Sepay trong DTO.
- Webhook @Public: tự verify secret; không rò secret ra response/log.
