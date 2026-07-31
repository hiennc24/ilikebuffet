# M1 Foundation Handoff — P1–P5 done, P6 gate

**Date:** 2026-08-01 · **Repo:** https://github.com/hiennc24/ilikebuffet (`main`) · **Plan:** `plans/260731-1754-ilikebuffet-foundation-m1-pilot/`

Cook auto-run: 5/9 phases done, verified + reviewed + committed. **Paused at P6** (client review) — P7–P9 depend on P6.

## Done (mỗi phase: TDD → verify → code-review → fix → commit/push)

| Phase | Commit | Nội dung | Test |
|---|---|---|---|
| P1 Scaffolding | `263c9d6` | pnpm monorepo, NestJS, Prisma+PG16, testcontainers, money integer-VNĐ + lint, CI, drift check URL-to-URL | shared 15 |
| P2 Audit GA-01 | `ec5cab9` | audit_log append-only (REVOKE + trigger + owner segregation), in-tx audit ~0.8ms, WORM export | +api |
| P3 Auth/RBAC | `dc8a285` | JWT access+refresh, 6-role matrix, **global fail-closed branch-scope**, Redis revocation ≤30s/request, device registry + dual PIN | api 169 |
| P4 Master Data | `11fddb0` | branch config + code-immutable-after-tx, ingredients/units/CoA/suppliers (HQ approval), holiday-calendar, Excel import (vn-normalize, validate-before-write, column-map) | api 251 |
| P5 Frontend | `87cc5d5` | packages/ui (POS-first, token bridge), apps/admin SPA, apps/pos PWA (Dexie draft store), shared auth client | ui 12, admin 11, pos 5 |

**Toàn repo hiện tại: 310 test xanh · build/lint/drift sạch.** Mỗi phase đã qua 1 vòng code-review độc lập; toàn bộ finding Critical/High đã fix + test (chi tiết ở từng `phase-0X-*.md` mục "post-review fixes").

## Bất biến "không cắt" — trạng thái
- Gapless bill numbering: **chưa** (P7). Counter lock order counter→audit đã ghi chú sẵn (C4).
- Offline sync server-trọng-tài: **chưa** (P8). Dexie draft store scaffold sẵn (P5).
- Branch-scope fail-closed: **có** (P3 global guard; P4 data-read qua `requireScope`).
- Audit append-only chống insider: **có** (P2, 4 lớp test).
- Không mất bill / persist draft: scaffold sẵn (P5), logic P7/P8.

## CẦN BẠN QUYẾT (mở khoá P6 → P7–P9) — needs-client-confirm
1. **#3 Mốc tính giá** — giá theo **thời điểm TẠO bill** hay **THANH TOÁN**? (đang default TẠO; resolver config-driven, đảo = 1 dòng). *Load-bearing cho P6/P7/P8.*
2. **#4 Vé miễn phí** — có bắt buộc đi kèm ≥1 vé có phí không? (đang default bắt buộc).
3. **#2 Giờ ngoài khung giá** — quầy chặn tạo bill "ngoài giờ bán vé", hay bán xuyên khung?
4. **#8 6 file Excel kế toán mẫu thật** — cần file thật để bind column-map (import ingredient đã chạy; export kế toán deferred). *Chặn phần Excel kế toán ở P4/P6.*

## Rủi ro / carry-forward còn treo
- **P7 phải gọi `registerTransactionChecker`** (branch/ingredient) nếu không rule immutable mã CN/nguyên liệu vẫn inert dù test pass.
- **Bench audit 0.8ms là uncontended** — đo lại dưới tải + counter-lock trước khi chốt in-tx-không-outbox ở P7.
- **WORM export chưa chạy off-box** (chưa scheduler + object-lock) → H1 "đủ kiến trúc" nhưng chưa vận hành; wire ở P9/deploy.
- **Token/deviceSecret ở web storage** (XSS) — accepted M1 risk, chuyển httpOnly cookie + secure device-secret ở P8.
- **Branch directory visibility (H3)**: mình đặt default an toàn (non-chainWide chỉ thấy CN mình, ẩn bankAccount) — xác nhận nếu muốn chain-visible.
- **POS icon PNG thật** cần trước khi submit PWA store.
- **migrate dev shadow-DB flaky** trong env này → migration viết tay + verify bằng drift script (đã thành nếp).

## Deploy note (mới, đã vào docs/code-standards.md)
App runtime nối DB bằng role `ilikebuffet_app` (APP_DATABASE_URL), migrations dùng owner. Deploy audit: `migrate deploy` → `provision-app-roles.sql` → `apply-audit-guards.sh` (trigger → owner segregation → grants).

## Unresolved questions
- 4 mục needs-client-confirm ở trên (đặc biệt #3 quyết kiến trúc pricing).
- Branch directory chain-visible hay không (H3).
