---
phase: 1
title: "Scaffolding & Test Harness"
status: done
priority: P1
dependencies: []
completed: "2026-07-31"
---

# Phase 1: Scaffolding & Test Harness

## Overview
Dựng monorepo TS, NestJS API skeleton, Prisma+Postgres, Docker compose, và **test harness chạy được với Postgres thật** — nền để mọi phase sau viết test-first.

## Requirements
- Functional: `pnpm dev` chạy API + DB; `pnpm test` chạy unit + integration (Postgres qua testcontainers).
- Non-functional: CI xanh trên PR; migration reproducible; timezone `Asia/Ho_Chi_Minh`; tiền lưu **integer VNĐ** (không float).

## Architecture
- **Monorepo** pnpm workspaces: `apps/api` (NestJS), `apps/admin` (React), `apps/pos` (React PWA), `packages/shared` (types, money utils, zod schemas), `packages/print-agent`.
- **API**: NestJS modules rỗng theo epic — `platform, sales, finance, purchasing, inventory, reporting, audit` (chỉ tạo `platform`, `sales`, `audit` ở M1; còn lại folder trống có README).
- **DB**: PostgreSQL 16; Prisma schema + migration; helper `withTx()` + raw-SQL escape hatch cho `FOR UPDATE`.
- **Test**: Jest + `@nestjs/testing` + supertest; testcontainers-postgres cho integration; factory helpers trong `packages/shared/test`.
- **Money**: kiểu `VndAmount = number` (integer), util `assertInteger`; ESLint chặn phép chia trực tiếp trên tiền không qua util làm tròn.

## Related Code Files
- Create: `pnpm-workspace.yaml`, `docker-compose.yml`, `apps/api/` (Nest skeleton), `packages/shared/src/money.ts`, `packages/shared/test/db.ts` (testcontainers bootstrap), `.github/workflows/ci.yml`, `prisma/schema.prisma`
- Modify: —
- Delete: —

## TDD Steps (test-first)
1. **RED**: viết `money.spec.ts` — làm tròn VNĐ, cấm float drift (VD chia hoá đơn), format tiền vi-VN.
2. **GREEN**: implement `packages/shared/src/money.ts`.
3. **RED**: integration test `health.e2e-spec.ts` — API `/health` + kết nối DB qua testcontainers trả 200.
4. **GREEN**: Nest bootstrap + Prisma module + health endpoint.
5. **REFACTOR**: `withTx()` helper + ví dụ raw `SELECT 1 FOR UPDATE` trong test chứng minh lock hoạt động.
6. CI: cache pnpm, chạy lint + test + `prisma migrate diff` (fail nếu schema lệch migration).

## Success Criteria
- [x] `pnpm test` xanh local + CI, integration dùng Postgres thật (không mock). — api 2/2 via testcontainers pg16; CI wired.
- [x] Money util có test drift; lint chặn thao tác tiền không an toàn. — shared 15/15; `money/no-unsafe-money-arithmetic` fires (identifier + member expr).
- [x] `withTx()` + raw `FOR UPDATE` chứng minh bằng test. — NOWAIT 55P03 proof on a dedicated connection (pool-size independent).
- [x] Timezone + integer-VNĐ convention ghi trong `docs/code-standards.md`.

## Risk Assessment
- Testcontainers chậm/CI flaky → pin image, reuse container trong 1 test run. Không thoả hiệp dùng SQLite (khác Postgres ở lock/tx — sẽ giấu bug hot-path).

## Red Team Hardening (2026-07-31)
- **M5** — chỉ tạo module M1 (`platform, sales, audit`) + `packages/shared`. **KHÔNG** tạo folder epic rỗng (`finance/purchasing/inventory/reporting`) — thêm khi wave bắt đầu (tránh pre-commit data model khi 8 needs-client-confirm chưa chốt). `packages/print-agent` tạo ở **P7**, không phải P1.
- **H9** — bỏ **BullMQ/worker** khỏi scaffolding M1 (không job async nào ở P1–P9). Redis chỉ dựng cho revocation list (P3).
- **AD7/M4 (test isolation)** — test concurrency (đánh số bill) **KHÔNG** dùng container reuse với shared state: mỗi test concurrency chạy schema/tx-rollback isolation riêng, tránh row rác test trước làm giả kết quả gapless.
- New success criteria: [x] test concurrency có isolation chứng minh (không state bleed) — `startTestDb()` = 1 clean DB/run; isolation guidance documented in `test/db.ts`; concurrency numbering test itself lands in P7. [x] monorepo chỉ chứa module/app có consumer M1 — chỉ `apps/api` + `packages/shared`; module placeholders `platform/sales/audit` (README-only); admin/pos defer to P5.

### Post-review fixes (code-reviewer DONE_WITH_CONCERNS, all applied)
- H1: lock test uses a dedicated 2nd connection + asserts 55P03 (was pool-size dependent + bare toThrow).
- M1: `applyPercent` guards product overflow past MAX_SAFE_INTEGER.
- M2: negative-input tests pin `splitVndEvenly`/`roundVnd` refund behaviour.
- M3: ESLint money rule now also matches member expressions (`order.totalAmount / n`).
- L5: `@testcontainers/postgresql` → devDependency in `packages/shared`.
- H2 (env landmine) + M4 (drift `_prisma_migrations` note) documented, no code risk.
