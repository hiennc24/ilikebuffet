#!/usr/bin/env bash
# Apply the audit-log DB-level immutability guards AFTER prisma migrate deploy.
# These live outside Prisma migrations (Prisma models neither triggers nor roles).
#
# Order matters: table must exist (migrate deploy) -> trigger -> role grants.
# The role grants require role "ilikebuffet_app" to exist first (DBA-provisioned).
#
# Usage: DATABASE_URL=postgresql://owner:...@host/db scripts/apply-audit-guards.sh
#   Set SKIP_ROLE_GRANTS=1 to apply only the trigger (e.g. envs where the app
#   role is managed separately).
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL (privileged/owner role) }"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Applying audit immutability trigger"
pnpm exec prisma db execute --url "$DATABASE_URL" --file "$ROOT/prisma/sql/audit-immutability.sql"

if [ "${SKIP_ROLE_GRANTS:-0}" != "1" ]; then
  # Requires provisioned roles: audit_owner (NOLOGIN) and ilikebuffet_app.
  echo "==> Reassigning audit objects to audit_owner (owner segregation, C1)"
  pnpm exec prisma db execute --url "$DATABASE_URL" --file "$ROOT/prisma/sql/audit-ownership.sql"
  echo "==> Applying audit role grants (ilikebuffet_app)"
  pnpm exec prisma db execute --url "$DATABASE_URL" --file "$ROOT/prisma/sql/audit-role-grants.sql"
fi

echo "==> Audit guards applied"
