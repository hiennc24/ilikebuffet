# Code Standards — ILikeBuffet

Living document. Update when a convention changes.

## Money — integer VND only

- All money is an **integer number of đồng (VND)**. Type alias `VndAmount = number`
  in `@ilikebuffet/shared`. Never store or compute money as a float.
- Cross every money boundary through the shared utils:
  - `assertVndInteger(x)` — guard at boundaries (DTO parse, DB read).
  - `roundVnd(x)` — the only sanctioned rounding (half-up to đồng).
  - `splitVndEvenly(total, n)` — bill splits; remainder distributed, sum exact.
  - `applyPercent(amount, pct)` — percentages (VAT, discounts) → integer đồng.
  - `formatVnd(x)` — vi-VN display (`150.000 ₫`).
- **Lint enforced:** `money/no-unsafe-money-arithmetic` (see `eslint.config.mjs`)
  flags raw `/` or `*` on money-named identifiers. Route the math through utils.
- DB columns for money are integer types (`BigInt`/`Int`), never `Float`/`Decimal`
  configured for fractional đồng.

## Time & timezone

- App/DB timezone is **`Asia/Ho_Chi_Minh`** (see `docker-compose.yml`, `.env.example`).
- Store timestamps in UTC (`timestamptz`); render in `Asia/Ho_Chi_Minh`.
- Business-day boundaries (shift close, price-by-date) are computed in local TZ.
  Device clock skew is not trusted for pricing/day — the **server** timestamp
  decides (Red Team H5; enforced from P6/P8).

## Database & transactions

- PostgreSQL 16 everywhere — local, CI, prod. **No SQLite**, even in tests: lock/tx
  semantics (`FOR UPDATE`) that the hot path relies on differ per engine.
- Multi-statement atomic work goes through `PrismaService.withTx()`.
- Row locks use `SELECT ... FOR UPDATE` via the raw-SQL escape hatch. Keep locked
  sections short; lock in a fixed order (counter → audit) to avoid deadlocks (C4).
- One owner for `prisma/schema.prisma` across P4/P6/P7 to avoid parallel migration
  races. Migrations are committed and drift-checked in CI (`prisma migrate diff`).

## Testing

- Integration tests run against a real Postgres via testcontainers
  (`@ilikebuffet/shared/test` → `startTestDb`).
- Concurrency tests (bill numbering) must isolate state (own schema or
  rolled-back tx) so leftover rows can't fake a gapless result (Red Team AD7/M4).

## Naming & structure

- pnpm monorepo: `apps/*` (api, admin, pos), `packages/*` (shared, print-agent).
- Files: kebab-case for TS. NestJS modules grouped by epic under `apps/api/src/modules`.
- Only M1-consumed modules exist now (`platform`, `sales`, `audit`); other epic
  folders are added when their wave starts (Red Team M5).
