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

## M3+ — Backlog (not started)

- **Đối soát & Báo cáo (Reconciliation & reporting):** shift reconciliation
  (cash vs system, offline high-water-mark holes, quarantine review), revenue
  reports by shift/branch/date, net-of-refunds revenue, exports.
- **Kho & Nhập hàng (Inventory):** purchase orders, stock in/out, BOM consumption.
- **Tự động hoá thanh toán:** VietQR auto-reconcile (webhook), replacing manual
  payment confirmation.
