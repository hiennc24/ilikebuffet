# Deployment & Disaster-Recovery Guide (M1 pilot — CN1)

Operational runbook for the ILikeBuffet M1 pilot. The DR drill and go-live steps
are **operational verifications** with a named owner and dry-run date — not
automated tests.

## 1. Stack

- PostgreSQL 16 (single primary for M1), Redis (revocation list only), NestJS API,
  Admin SPA + POS PWA, local print-agent per counter.
- App connects as the non-owner `ilikebuffet_app` role in production so the
  append-only audit REVOKE/trigger layer applies (owner connection bypasses it).

## 2. Backup & Disaster Recovery

### 2.1 Posture — PITR-to-crash (WAL archiving), RPO ≈ seconds (Decision V3)

- Enable continuous WAL archiving + a daily base backup.
- **Prefer PITR replay to the last archived WAL (near crash point)** over
  restore-to-a-backup-snapshot. Restoring to an older snapshot can roll the
  `bill_counter` back and re-issue already-printed numbers.

### 2.2 Numbering after restore (Red Team C7 — the critical invariant)

The gapless bill number must never be re-issued after a restore.

1. **Do NOT trust `bill_counter.last_no`.** After any restore, reconcile it from
   the source of truth — the bills themselves:
   ```sql
   -- Per (branch, business date), the counter must be at least MAX(seq).
   UPDATE bill_counter c
   SET "lastNo" = sub.max_seq
   FROM (
     SELECT "branchId", "businessDate", MAX(seq) AS max_seq
     FROM bill GROUP BY "branchId", "businessDate"
   ) sub
   WHERE c."branchId" = sub."branchId"
     AND c."businessDate" = sub."businessDate"
     AND c."lastNo" < sub.max_seq;
   ```
2. **Offline outbox durability.** Devices keep synced bills in the outbox until
   they receive the official number, and should retain synced bills for N days so
   temp→official numbers can be reconciled after a DR replay.

### 2.3 DR success criteria (Red Team C7 — not just "contiguous")

A DR drill passes only when **all** hold after restore:

- [ ] **No duplicate official number** — `SELECT "branchId","businessDate",number, count(*) FROM bill GROUP BY 1,2,3 HAVING count(*) > 1` returns zero rows.
- [ ] `bill_counter.last_no ≥ MAX(bill.seq)` for every (branch, date).
- [ ] **Every temp number reconciles** — each device `tempNumber` maps to exactly one official `number`, and any hole below a shift's `tempHighWater` is explained by a `bill.void_before_sync` audit event (not a silent loss).
- [ ] Contiguity of issued numbers holds (necessary, but not sufficient on its own).

### 2.4 DR drill (operational)

- **Owner:** _<assign before go-live>_ · **Dry-run date:** _<assign, before CN1 go-live>_
- Steps: take a base backup → generate load (see `load-test/`) → simulate crash →
  PITR replay to last WAL → run §2.2 reconcile → verify §2.3 criteria.

## 3. Load / performance gate (BH-02.6)

- Run `k6 run load-test/bill-create-load.js` against a prod-like stack.
- Gate: p95 of bill creation `< 1s` at 5× pilot load (40 bills/min) for 30 min,
  zero errors, and no duplicate numbers under contention.
- Run this **as soon as P7 is deployable** — do not wait for go-live.

## 4. Monitoring & minimal business alerts (M1)

- Infra: health/uptime (`GET /health`), error tracking (Sentry), DB/API metrics.
- Business alerts (minimum for M1):
  - **Bill stuck in sync > 15 min** (BH-05.7) — surfaced client-side in the POS
    banner; escalate to the branch manager.
  - **Shift close variance** non-zero — flagged at close, requires a note.
  - **Quarantined bills** (`bill.quarantined = true`) — clock skew / payment
    mismatch / force-closed; route to accounting review.

## 5. Two-week parallel pilot (safety net — do not cut)

Run the new system alongside the current process for 2 weeks at CN1. Reconcile
daily totals between the two before switching over.

## 6. Environment configuration (secrets)

Set these on the API host (never commit real values — `.env` is gitignored; see
`.env.example` for the full list). Rotate on staff turnover.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection (migrations / owner tasks). |
| `APP_DATABASE_URL` | App runtime connection as the non-owner `ilikebuffet_app` role (keeps the audit REVOKE layer active). Provision via `scripts/provision-app-roles.sql` + `scripts/apply-audit-guards.sh`. |
| `REDIS_URL` | JWT revocation list. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Strong random (`openssl rand -hex 32`). |
| `PORT` | API listen port. Local dev defaults to **3001** to match the admin/POS Vite dev proxy (`VITE_API_PORT`, default 3001) and avoid the common 3000 collision. |
| `SEPAY_API_KEY` | Shared secret for the VietQR auto-reconcile webhook (§7). Unset = webhook rejects everything (fail-closed). |

**Local run:** `pnpm dev` (API watch on `PORT`, default 3001) + the admin/POS Vite
dev servers (same-origin proxy → API). Production start is `pnpm --filter
@ilikebuffet/api start:prod` → `node dist/apps/api/src/main.js` (the nest build
emits under `dist/apps/api/src/` because the monorepo rootDir spans `packages/`).
A stale hand-run build serves old routes — rebuild (`build`) before `start:prod`.

## 7. VietQR auto-reconcile (Sepay webhook)

1. In the Sepay dashboard, add a webhook pointing at
   `POST https://<api-host>/webhooks/sepay` for the branch's bank account, with an
   `Authorization: Apikey <value>` header whose value equals `SEPAY_API_KEY`.
2. The endpoint is public (no user session) and fail-closed: a missing/wrong key
   returns 401; only inbound (`transferType: "in"`) transfers are stored; replays
   are idempotent per Sepay transaction id.
3. Matching is automatic when exactly one unpaid bill has the same total and its
   number appears in the transfer memo — the POS VietQR QR embeds the bill number
   (`addInfo`) and amount, so a customer scan-and-pay reconciles hands-free.
4. Zero/ambiguous/mismatched transfers land UNMATCHED in
   **Báo cáo → Đối soát ngân hàng** for a chain-level user to match-by-number or
   ignore. Nothing is auto-paid twice (the bill's `paidAt` is the guard).

Smoke test after deploy: send a Sepay test webhook (or `curl` with the Apikey
header + a sample `in` payload) and confirm a `bank_transaction` row appears.
