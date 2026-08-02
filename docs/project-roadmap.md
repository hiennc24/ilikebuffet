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

## M5+ — Backlog (not started)

- **Định lượng món (BOM) + tự trừ kho khi bán:** recipe consumption deducts stock
  automatically on each sale (split from M4).
- **Tự động hoá thanh toán:** VietQR auto-reconcile (webhook), replacing manual
  payment confirmation.
- Small carry-overs: shift-cash xlsx export; system-architecture doc.
