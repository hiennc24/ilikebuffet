#!/usr/bin/env bash
# Fail if prisma/schema.prisma has drifted from the committed migrations.
#
# Why URL-to-URL and not `migrate diff --from-migrations --to-schema-datamodel`:
# the datamodel comparison has a known false positive on SERIAL/autoincrement
# columns (reports "column became autoincrementing" every run). Comparing two
# REAL databases — both introspected — is exact.
#
# Requires two EMPTY Postgres databases (same default `public` schema):
#   MIGRATIONS_DB_URL — migrations are applied here
#   SCHEMA_DB_URL     — current schema is materialised here (db push)
# In CI these come from two service containers; locally, two throwaway DBs.
set -euo pipefail

MIGRATIONS_DB_URL="${MIGRATIONS_DB_URL:?set MIGRATIONS_DB_URL to an empty postgres db}"
SCHEMA_DB_URL="${SCHEMA_DB_URL:?set SCHEMA_DB_URL to an empty postgres db}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA_FILE="$ROOT/prisma/schema.prisma"

echo "==> Applying committed migrations"
DATABASE_URL="$MIGRATIONS_DB_URL" pnpm exec prisma migrate deploy --schema "$SCHEMA_FILE"

echo "==> Materialising current schema"
DATABASE_URL="$SCHEMA_DB_URL" pnpm exec prisma db push --skip-generate --accept-data-loss --schema "$SCHEMA_FILE"

echo "==> Diffing (both introspected — exact)"
# Direction migrations -> schema. Prisma's diff ignores its own bookkeeping
# table (`_prisma_migrations`, present only on the migrations DB), so it does
# not surface as a spurious drop. Any real drift in domain tables will.
pnpm exec prisma migrate diff --from-url "$MIGRATIONS_DB_URL" --to-url "$SCHEMA_DB_URL" --exit-code
echo "==> No drift: schema is in sync with migrations"
