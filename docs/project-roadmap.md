# Project Roadmap — ILikeBuffet

Multi-branch buffet POS. This tracks milestone status and the forward backlog.
Source of truth for detail lives in `plans/<timestamp>-<slug>/`.

## M1 — Foundation + CN1 sales pilot ✅ code-complete

Audit (GA-01), auth/RBAC/devices, branches + master-data, ticket types / price
matrix / discounts, shifts + bills + payments (+ cash over-tender), offline POS
PWA with server-authoritative sync, print-agent. Pricing decisions confirmed:
out-of-hours blocks bill creation; price is fixed at bill creation (`createdAt`);
a free-ticket-only bill is allowed.

Plan: `plans/260731-1754-ilikebuffet-foundation-m1-pilot/`.

## M2 — Admin operations & management (in progress)

Fills the admin UI over M1 backends + a few backend gaps. Plan:
`plans/260802-0040-m2-admin-operations-management/`.

| Phase | Scope | Status |
|-------|-------|--------|
| P0 | List-screen foundation (usePagedList, Pagination, DetailDrawer, FilterBar) | ✅ done |
| P1 | Đơn hàng (Orders) list + **Refund** (schema + PIN + audit) | ✅ done |
| P2 | Chi nhánh (Branches) | ✅ done |
| P3 | Master-data — Suppliers, Holidays, Ingredients(+import), Accounts | ✅ done |
| P4 | **Users** (insider-resistant) + **Devices** (list/suspend) | ✅ done |
| P5 | Nhật ký (Audit viewer, read-only, branch-scoped) | ✅ done |
| P6 | RBAC per-screen (role-based nav/route hiding) + docs | ✅ done |

Server is always the authorization gate; the FE RBAC only hides screens a role
can't use. New money flow (refund) keeps the M1 invariants (integer VND,
sum(refunds) ≤ total, PIN + in-tx audit, concurrency-guarded).

M2 is functionally complete. All phases (P0–P6) plus carry-overs (P3b/c/d, P4b)
are delivered.

## M3 — Đối soát & Báo cáo ✅ done

Reporting module (`sales/reports`): net revenue (gross − refunds) by
day/branch/shift + by-ticket-type, shift cash reconciliation (expected vs counted
vs system cash), offline reconciliation (quarantine review + resolve, bill-number
gap detection), and dashboard KPIs. All read-mostly, branch-scoped, role-gated
(HQ/owner/chain-accountant + per-branch manager; dashboard open to any admin).
xlsx export for revenue. Plan: `plans/260802-0409-m3-reconciliation-reporting/`.

## M4 — Kho & Nhập hàng (Inventory) ✅ done

Inventory module (`inventory/`): purchase orders to suppliers (create/edit while
DRAFT, DRAFT→SENT→RECEIVED/CANCELLED), goods receipt (purchase-unit → base
conversion, moving-average cost), on-hand balances + movement ledger, manual
issue (wastage) and stock-take adjust, and a stock valuation report (value by
branch/group + low-stock count). Quantities are fractional base units; money is
integer VND (cost = roundVnd(qty × price)). Balances are row-locked and never go
negative; `balance == Σ movements` holds. Branch-scoped + role-gated (warehouse +
branch manager + chain admins; chain accountant reads valuation). Plan:
`plans/260802-0618-m4-inventory/`.

## M5 — Định mức (BOM) & tự trừ kho khi bán ✅ done

Per-ticket-type ingredient recipe (`ticket_type_recipe`, chain-wide) managed under
`inventory/recipes`. Selling a ticket auto-deducts Σ(recipe × ticket qty) from the
bill's branch stock — hooked into both online create and offline sync — and
cancelling a bill restores it (idempotent, driven by the movement ledger, not the
recipe). Sale-consumption never blocks a sale (on-hand may go negative — recipes
are estimates) and leaves moving-average cost unchanged; refunds don't touch stock.
Adds an estimated-COGS consumption report (net of cancellations). Plan:
`plans/260803-0926-m5-bom-consumption/`.

## M6 — Lãi gộp (doanh thu − giá vốn) ✅ done

Gross-margin report under `sales/reports/gross-margin` (+ xlsx export): net revenue
(M3) − estimated COGS (M5 sale-driven consumption) by day or branch, with totals
and margin %. COGS attributes to the bill's businessDate (mapped via billId, since
StockMovement has no FK to Bill) so it aligns with revenue; a bill cancelled
in-window nets to zero on both sides, and offline-synced movements land on the
right day. Branch-scoped + role-gated. Plan: `plans/260803-1001-m6-gross-margin/`.

## M7 — Định mức theo chi nhánh (override) ✅ done

Per-branch recipe overrides on `ticket_type_recipe` via a nullable branchId (null
= chain-wide default) with two partial unique indexes (chain-wide + per-branch).
On sale, consumption uses a branch's override wholesale when present, else falls
back to the chain-wide recipe. Recipe CRUD is scope-aware (`?branchId=`): chain-wide
edits stay HQ/owner, per-branch overrides may also be set by the branch manager
(access-checked). The recipe screen adds a scope selector. Plan:
`plans/260803-1121-m7-branch-recipe/`.

## M8 — VietQR tự đối soát (Sepay webhook) ✅ done

Inbound bank transfers arrive via a public, Apikey-verified webhook
(`POST /webhooks/sepay`, secret `SEPAY_API_KEY`, fail-closed) and are stored
idempotently in `bank_transaction`. A transfer auto-confirms a VIETQR payment when
exactly one unpaid bill matches its amount and its number appears in the transfer
memo; zero/ambiguous/already-paid go to a chain-level review screen
(`/reports/bank-reconcile`) for manual match-by-number or ignore. Plan:
`plans/260803-1147-m8-vietqr-reconcile/`.

## M9 — Giá vốn thực tế theo lô (FIFO) ✅ done

Actual per-lot (FIFO) cost of goods sold, computed by replaying the StockMovement
ledger (RECEIPT rows are the lots) — no new table, no outflow hooking, and the
moving-average balance/on-hand valuation is untouched. Exposed at
`GET /inventory/reports/fifo-cogs` (period + branch, view-gated) and shown on the
gross-margin screen next to the moving-average estimate. Plan:
`plans/260803-1215-m9-fifo-cogs/`.

## Carry-overs ✅ done

- Shift-cash reconciliation xlsx export (`/sales/reports/shift-cash/export`).
- System architecture doc (`docs/system-architecture.md`).

## Backlog (not started)

- (None outstanding — propose the next milestone with the team.)
