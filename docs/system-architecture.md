# System Architecture

ILikeBuffet — multi-branch buffet POS. Modular NestJS monolith + PostgreSQL, a
React admin SPA, and an offline-capable POS PWA. This document maps the modules,
the cross-cutting invariants they all obey, and the main data flows. For
conventions see `code-standards.md`; for deploy see `deployment-guide.md`.

## Stack

- **API** — NestJS 11 modular monolith (`apps/api`); Prisma ORM + raw
  `SELECT … FOR UPDATE` on hot paths (bill numbering, stock balances, vouchers).
- **DB** — PostgreSQL 16. Migrations are hand-written additive SQL under
  `prisma/migrations/<ts>_<name>/`, applied with `prisma migrate deploy`.
- **Frontend** — React 19 + Vite admin SPA (`apps/admin`) and POS PWA (`apps/pos`).
- **Shared** — `packages/shared` (money, api-client, price resolver), `packages/ui`.
- **Cache** — Redis (JWT revocation list).

## Cross-cutting invariants

These hold across every module and are the backbone of the design:

- **Money is integer VND.** All amounts use `@ilikebuffet/shared` money helpers
  (`sumVnd`/`multiplyVnd`/`roundVnd`/`formatVnd`). A custom eslint rule
  (`money/no-unsafe-money-arithmetic`) forbids raw `*`/`/` on money-named values.
  Quantities may be fractional (kg/lít) as Decimal; cost = `roundVnd(qty × price)`.
- **Server is the sole authority.** Clients never send prices; the API resolves
  price, allocates bill numbers, and arbitrates offline sync.
- **Branch-scoping, fail-closed.** `BranchScopeGuard` enforces membership from the
  JWT (`chainWide` + `branchIds`); routes keyed only by an id re-check the
  resource's branch via `assertBranchAccess`. Out-of-scope access yields no rows.
- **RBAC in three layers.** Backend role gates (Role sets) + FE `lib/rbac.ts`
  (`RESTRICTED_SCREENS`, `canAccessPath`) + `RequireAccess` route guard.
- **Audit is append-only.** `AuditService.record(tx, …)` writes inside the business
  transaction (change and log commit or roll back together). No update/delete
  audit routes; the DB role is REVOKE-guarded in production.
- **Concurrency via row locks.** Gapless counters and stock balances serialize
  with `INSERT … ON CONFLICT DO NOTHING` + `SELECT … FOR UPDATE`, re-reading
  inside the transaction to avoid lost updates.

## Modules

### Platform (`apps/api/src/platform`, `auth`, `audit`)

- **auth** — JWT access/refresh, 6-role RBAC, device PINs; Redis revocation.
- **rbac** — `BranchScopeGuard`, `@Public`/`@Unscoped` decorators, `BranchAccess`.
- **master-data** — branches, units, ingredient groups, ingredients (+ ≤3 purchase
  units), chart of accounts, suppliers; Excel import.
- **audit** — GA-01 append-only log, insider-resistant guards.

### Sales (`apps/api/src/sales`)

- **ticket-types / pricing / discounts** — buffet ticket config, time-window ×
  day-type price book (server-resolved, snapshotted onto bills), discount programs.
- **shifts** — open/close with cash count + variance; force-close via manager PIN.
- **bills** — server-authoritative create (gapless per-branch numbering, price
  snapshot), cancel (manager PIN), and **offline sync** (idempotent per
  device+clientUuid, quarantine on clock skew).
- **payments** — record CASH/VIETQR/CARD; sum must equal bill total; sets `paidAt`.
- **reports** — net revenue, shift-cash reconciliation, offline reconciliation
  (quarantine + number-gap detection), dashboard KPIs, **gross margin**
  (revenue − estimated COGS), **P&L** (net revenue − COGS − opex). xlsx export on
  revenue / gross-margin / P&L / shift-cash.
- **finance** — cash-book (`financial_transaction`): income/expense vouchers
  against the chart of accounts and supplier payables (`supplier_payable`).
  Capability-gated (`cash:create-voucher` / `cash:read`); over-threshold vouchers
  need a manager PIN. See flow below.
- **bank-reconcile** — Sepay webhook (VietQR auto-reconcile); see flow below.

### Inventory (`apps/api/src/inventory`)

- **purchase-orders** — PO CRUD, DRAFT→SENT→RECEIVED/CANCELLED.
- **receipts** — goods receipt: purchase-unit → base conversion, moving-average cost.
- **inventory-balance** — the ledger core: `StockMovement` (append-only, signed
  base-unit qty) drives `InventoryBalance` (on-hand + moving-average cost),
  row-locked; on-hand is blocked below zero for manual issue/adjust.
- **stock** — balances, movement history, manual issue (wastage) + stock-take adjust.
- **consumption** — per-ticket recipe (`ticket_type_recipe`, chain-wide default +
  per-branch override); a sale auto-deducts `Σ(recipe × ticket qty)` (never blocks
  the sale — on-hand may go negative), and a bill cancel reverses it.
- **reports** — stock valuation + low-stock, estimated-COGS consumption, and
  **FIFO** actual-cost COGS (replays the movement ledger; moving-average untouched).

## Key flows

### Bill lifecycle + stock consumption

```
POS → POST /sales/bills ──tx──▶ resolve price · allocate gapless number ·
      create Bill+Lines · audit(bill.create) · consumeForBill (ISSUE refType BILL)
POST /sales/bills/:id/payments ──tx──▶ Payment(s) (Σ = total) · paidAt · audit(bill.pay)
POST /sales/bills/:id/cancel   ──tx──▶ status CANCELLED · reverseForBill (restore stock)
Offline: POST /sales/bills/sync ──tx──▶ same, idempotent per (deviceId, clientUuid)
```

### Stock costing (dual view)

`RECEIPT` movements carry the actual lot cost; `InventoryBalance.avgCostVnd`
maintains the **moving average** for on-hand valuation and estimated COGS. The
**FIFO** report replays the same `StockMovement` ledger (RECEIPT rows = lots) to
value goods sold at real lot cost — additive, no schema change, average untouched.

### Inter-branch stock transfer + chain BI

An atomic transfer ISSUEs from the source branch (blocked below zero) and RECEIPTs
into the destination at the source's moving-average cost, in one transaction —
both legs are StockMovements (refType "TRANSFER", shared refId), so
`balance == Σ movements` holds on both branches. The chain-overview report rolls
up per-branch net revenue / bills / cash-variance / low-stock (ranked), gated to
chain-level roles — the same branch-scoping model, just aggregated.

### Finance: cash-book, supplier debt & P&L

```
POST /sales/finance ──tx──▶ FinancialTransaction (INCOME/EXPENSE, account snapshot)
      · over threshold → verifyApprovalPin(manager) · audit(finance.create)
Goods receipt ──tx──▶ … RECEIVED · SupplierPayable(OPEN, due = receipt + debtTerms)
POST /sales/finance/payables/:id/pay ──tx──▶ EXPENSE FinancialTransaction (supplier-linked)
      · payable.paidVnd += amount · status PAID when settled (overpay rejected)
```

P&L (`/sales/reports/pnl`) = net revenue − COGS − opex, keyed by day/branch. COGS
is moving-average consumption (shared with gross margin). **Opex excludes
supplier-linked EXPENSE entries** — supplier payments settle payables for received
goods already counted as COGS, so counting them again would double-count; opex is
non-supplier operating cost (rent, salary, utilities). This is also why booking
raw-material purchases as thu-chi is discouraged.

Capability enforcement: the finance controller gates each route on
`can(role, capability)` from the RBAC matrix — E3 is the first module to use the
capability matrix rather than hardcoded role sets.

### VietQR auto-reconcile

```
Sepay ──POST /webhooks/sepay (Apikey, fail-closed)──▶ store BankTransaction (idempotent)
        └▶ match: unpaid bill with total == amount AND number ⊂ transfer memo
             ├─ exactly one  → create VIETQR Payment · paidAt · MATCHED · audit
             └─ none/ambiguous → UNMATCHED → chain-level manual review
                (/sales/bank-transactions: match-by-number / ignore)
```

## Frontend

- **admin SPA** — operations, master data, inventory, and reports on the design
  tokens; routes guarded by `RequireAccess`; reusable `usePagedList`/`useReport`,
  `DataTable`/`Dialog`, `admin-ui`/`report-ui`. Dev proxies API controller roots
  (`vite.config.ts`) to avoid CORS.
- **POS PWA** — offline-first cashier app; queues bills and syncs to the server,
  which remains the arbiter (numbering, price, quarantine).
