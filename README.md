# ILikeBuffet

Multi-branch buffet POS. Modular NestJS monolith + PostgreSQL, React admin SPA,
offline-capable POS PWA. Money is integer VND; bill numbering is gapless; the
server is the arbiter for offline sync.

See `plans/260731-1754-ilikebuffet-foundation-m1-pilot/plan.md` for the M1 roadmap
and `docs/code-standards.md` for conventions.

## Stack

- **API:** NestJS 11 (modular monolith) · Prisma + raw SQL/`FOR UPDATE` on hot paths
- **DB:** PostgreSQL 16
- **Frontend:** React admin SPA + POS PWA (offline) — from P5
- **Cache:** Redis (revocation list only at M1)
- **Monorepo:** pnpm workspaces — `apps/*`, `packages/*`

## Prerequisites

- Node `22.14.0` (`.nvmrc`), pnpm `10.33.0` (via corepack), Docker.

> **Always run tooling through `pnpm` / `pnpm exec`.** An ancestor `~/package.json`
> may declare a different `packageManager` (yarn) and its own `prisma` version.
> Corepack resolves the *nearest* `packageManager`, so commands run from this repo
> use pnpm — but a bare `prisma`/`yarn` invoked from outside can pick up the wrong
> CLI (e.g. Prisma 7 against our 6.x migrations). Use `pnpm exec prisma …`.

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:up            # start Postgres 16 + Redis
pnpm prisma:migrate   # apply migrations
pnpm dev              # run the API
```

## Common commands

| Command | What |
|---|---|
| `pnpm dev` | Run the API in watch mode |
| `pnpm test` | Unit + integration tests (integration uses testcontainers → needs Docker) |
| `pnpm lint` | ESLint (incl. money-safety rule) |
| `pnpm build` | Build all packages |
| `pnpm db:up` / `pnpm db:down` | Start / stop local Postgres + Redis |

## Layout

```
apps/
  api/            NestJS API (health + prisma harness at P1)
packages/
  shared/         money utils, types, test harness (testcontainers)
prisma/           single schema + migrations (one owner)
docs/             standards & architecture
plans/            implementation plans
```
