# Code Quality Review — M1 Sales / Offline / Monitor

Date: 2026-08-01 · Scope: this session's M1 feature code (~8,700 LoC, ~110 files)
across API sales backend, POS offline engine, admin FE, shared, print-agent.
Method: 3 parallel code-reviewer passes (read-only) + objective rule checks.
Checklist: logic · convention · performance · maintainability · defined rules.

## Verdict

Fundamentally sound, invariant-faithful work — gapless numbering, sync
idempotency, snapshot immutability, money helpers, and the price resolver are all
correct and well-tested. But the review surfaced **3 must-fix defects before
pilot** (2 authorization gaps + 1 offline double-submit) and a cluster of
**performance / correctness** issues centered on one root cause (per-line price
snapshot rebuild). Rule compliance is clean on money-safety and secrets; the
"Stable Code Artifacts" rule is broadly violated but matches pre-existing repo
convention (a decision, not a regression).

## Cross-cutting themes (fix once, resolves many)

1. **Branch authz on path-keyed routes** — the global `BranchScopeGuard` passes
   "keyless" when a request has no `branchId`; several `:id`-only routes then
   never self-enforce branch. Root of CR-1 + several read leaks.
2. **Price snapshot rebuilt per line** — `pricing.resolvePrice` calls
   `buildSnapshot()` (2 full table scans incl. all cells) on every call, and
   bill-create / sync / sell-page call it once **per line/ticket**. Root of
   HI-1, HI-2, and the offline price-parity gap. Fix: build the snapshot once,
   resolve all lines from it (the pure `resolvePrice(...)` already takes one).
3. **React effect hygiene** — `updateDeps` runs every render in both auth
   contexts; the pay-dialog createBill effect uses `[open]`-only deps (stale
   `isOnline`); `getOrCreateClientUuid` writes during render.

---

## Critical (fix before pilot)

**CR-1 · Cross-branch IDOR on path-keyed operations** — `payments.service.ts:33`,
`shifts.service.ts:92` (close), `:167` (force-close); reads `bills.controller.ts:40,45`.
The branch guard only enforces when a `branchId` is in the request; these routes
carry only `:billId`/`:id`. A THU_NGAN at branch A can record payments on, or
close/force-close, a bill/shift at branch B by id. `shifts.summary()` is the
correct pattern (self-enforces `access.branchIds.includes(shift.branchId)`).
**Fix:** apply the same branch check in `addPayments`, `close`, `forceClose`,
`getById`, `listByShift`. `cancelBill` is partly shielded by its device check but
should also assert branch.

**CR-2 · Approval PIN not bound to the operation's branch** — `discounts.service.ts:295`.
`verifyApprovalPin` checks `role === QUAN_LY_CN` but never that the manager belongs
to `dto.branchId`. Any manager's id+PIN approves a cancel/force-close/shift
force-close at **any** branch. Combined with CR-1, a cashier can approve
destructive actions with an out-of-branch manager. **Fix:** require
`dto.branchId ∈ manager.branchIds` (or a chain-wide role) before accepting the PIN.
_Unresolved: is chain-wide manager approval an intentional product decision?_

**CR-3 · Offline "Xác nhận thanh toán" has no in-flight guard → double-tap** —
`pay-dialog.tsx` offline branch. The online path sets `step="paying"` (disables
the button); the offline branch does not — it `await addToOutbox` then jumps to
success. A double-tap inserts the same `clientUuid` twice; the `&clientUuid`
unique index throws `ConstraintError`, caught as a generic error, showing a
**failure on an already-settled sale**. **Fix:** set `step="paying"` before the
await; treat a duplicate-key/existing row as success (idempotent).

---

## High

**HI-1 · N+1 full price-book snapshot rebuild on the bill hot path** —
`pricing.service.ts:437` (`buildSnapshot` per call) × `bills.service.ts:108` /
`sync.service.ts:138` (resolve per line). A 5-line bill ≈ 5 full price-book
scans; a 50-bill sync batch of 5-line bills ≈ **250 concurrent full scans**
(`Promise.all` in the sync controller) → DB/pool pressure, threatens the BH-02.6
`<1s` gate. **Fix:** build the snapshot once per bill/batch; batch ticketType
lookups (`findMany({ where: { id: { in } } })`).

**HI-2 · Sell-page online pricing is N requests per menu load** —
`sell-page.tsx:65` fires one `POST /sales/pricing/resolve` per ticket type (×N,
every 60s refetch) + a fire-and-forget `refreshCatalog` (+3 requests). **Fix:**
fetch the snapshot once and resolve client-side with the shared resolver — this
also **unifies online & offline pricing** and closes the parity gap below.

**HI-3 · Offline price-parity gap** — the offline total sums the cart's *stored*
unit prices (snapshotted at add-to-cart, persisted to the draft), not re-resolved
at bill time. After a Dexie-hydrated reload across a day/window boundary the
on-screen total can diverge from the resolver. Server recomputes on sync (not a
money-integrity bug), but it undercuts the "parity" claim and can show the
customer a wrong number. **Fix:** re-resolve each line via `resolveOfflinePrice`
at bill creation (folds into HI-2's unify).

**HI-4 · Client-controlled `createdAt` drives the counter/business-date on sync** —
`sync.service.ts:116`. Business date = `toVnDateStr(dto.createdAt)`, client-set.
The skew guard keys off the separate `clockOffsetMs`, so a bill with truthful
`clockOffsetMs:0` but a bogus `createdAt` allocates the official number into an
arbitrary day's counter — distorts per-day gapless range/reconciliation.
**Fix:** validate `createdAt` against server time independently of the reported
offset before using it as the counter/date key.

**HI-5 · `checkOpenShift` collapses network errors into `no-shift`** —
`pos-session-context.tsx:79`. A mid-shift cashier who is momentarily offline/500
is told "no open shift" and routed to Open Shift → **duplicate-shift risk**.
**Fix:** distinguish a transient `error` state (retain prior `shiftId`) from a
definitive 404.

**HI-6 · Float/NaN money reaches the printer** — `print-server.ts:39` validates
money fields only as `typeof === "number"`; `escpos-builder.ts` reimplements
`formatVnd` with `Math.trunc` and prints `"NaNđ"` for NaN/float. **Fix:** reject
non-integer/non-finite money (and validate `lines[].qty/unitPriceVnd`) in
`validatePayload`, or `assertVndInteger` in the builder.

**HI-7 · `qty` unvalidated on the sync path** — `sync.service.ts` (vs
`bills.service.ts:48` which validates). A negative/fractional/huge `qty` from a
compromised device yields a negative/NaN total, silently committed (C5
never-reject) unless the payment-sum check happens to catch it. **Fix:** validate
`qty` positive-integer on sync (corruption ≠ a legitimate printed sale).

**HI-8 · Shift-monitor gets stuck when the selected shift closes** —
`shift-monitor-page.tsx:62`. If the polled open-shift list no longer contains the
selected `shiftId`, the summary 404s/empties and the UI shows a permanent
`<LoadingState/>`. **Fix:** reset `shiftId` to `openShifts[0]?.id ?? null` when it
drops off the list.

---

## Medium

- **ME-1 · Money helpers bypassed in the API** — `bills.service.ts:130`,
  `sync.service.ts:158` use raw `unitPriceVnd * qty` and raw `+` reducers;
  `shared/money.ts` has `multiplyVnd` (overflow-guarded). Low overflow risk, but
  it's the exact rule the repo established. Use the helpers. (POS pay-dialog
  already uses `multiplyVnd` — good.)
- **ME-2 · `verifyApprovalPin` writes outside the caller's tx** —
  `bills.service.ts:286`: PIN audit + failure-counter commit before the
  state-change `withTx`; on rollback the approval audit and the operation
  diverge. Low impact (append-only, over-recording safer) but breaks the
  counter→audit-in-tx discipline used elsewhere.
- **ME-3 · Duplication: bills.service vs sync.service** resolvedLines build +
  line mapping are near-identical and already diverge (qty validation, ME-1).
  Extract `buildResolvedLines(tx, dto, snapshot, { rejectOnNoPrice })`.
- **ME-4 · `updateDeps` every render (no deps array)** — `auth-context.tsx:137`
  and `pos-auth-context.tsx:127`: reconstructs 4 closures + reads storage each
  commit. Add a deps array; extract the shared deps object (also kills a
  verbatim copy-paste of the constructor arg).
- **ME-5 · `exportVersionXlsx` bypasses ApiClient** — `pricing-page.tsx:82`: raw
  `fetch` with hardcoded storage keys, skipping the 401 silent-refresh. Add
  `api.download(path)` / a Response-returning variant.
- **ME-6 · print-agent CORS default `*`, no auth on `/print`** — any page the
  cashier's browser visits could POST a rogue print. No money authority, but an
  unauthenticated local actuator. Default `PRINT_AGENT_ORIGIN` to the POS origin;
  document as accepted risk (Sprint-0 H6).
- **ME-7 · User-facing internal codes** — `(VG-01.2)` in `title` tooltips
  (`ticket-types-page.tsx:174,496`) and `"(VG-02.1)"` inside a client error
  string (`pricing.service.ts`). Strip internal taxonomy from user-facing text.
- **ME-8 · DRY wins in admin-ui** — the inline `<select>` block (×4) and
  `<span role="alert">` error (×~8) are duplicated verbatim. Extract `Select` +
  `InlineError` into `_shared/admin-ui`. (Dialog scaffolding duplication is
  acceptable — one-off managers, YAGNI.)
- **ME-9 · Non-atomic `nextTempSeq`** — `outbox-store.ts:24`: localStorage
  read-modify-write; two bills in the same tick / two PWA tabs can duplicate a
  temp number. Server assigns the official number, so impact is reconciliation
  ambiguity only — soften the "guaranteed sequence" comment.
- **ME-10 · Cold-boot `clockSkew === null` bypasses the offline skew block** —
  `pay-dialog.tsx`: `clockSkew?.exceeded` is falsy when never measured (device
  booted offline). Server quarantines on sync, but the first-line defense is off
  exactly in the cold-boot case. Warn (not block) when `clockSkew === null`.
- **ME-11 · `console.log` leaks the full bill** on every online sale
  (`pay-dialog.tsx`); stale header comment ("Print: stub — console.log"). Remove.
- **ME-12 · Query-key coupling** — `["ticket-types"]`/`["time-windows"]` shared
  raw across pages; editing a ticket type repaints the pricing matrix.
  Centralize keys; drop the dead `|| "active"` (status is `ACTIVE`).

## Low (selected)

- Dead condition `OUT_OF_HOURS_POLICY === "BLOCK"` (const narrowed to literal) —
  YAGNI scaffolding in `price-resolver.ts:228`.
- `twoCol` uses UTF-16 length for column math → Vietnamese glyph misalignment on
  the receipt (cosmetic; revisit at codepage pin, BH-04.6).
- `getOrCreateClientUuid` called during render (`sell-page.tsx`) — move to memo/effect.
- Version tie-break by `id.localeCompare`: **OK** with cuid (time-prefixed);
  add a `createdAt` sort key if ids ever migrate to UUIDv4.
- Untyped casts: `catalog-cache.ts:44` (`status?`), `pos-db.ts` snapshot `unknown`.

## Rule compliance

- ✅ **Money-arithmetic safety** — no raw VND math except ME-1 (API bill/sync
  line totals); POS uses `multiplyVnd`. money.ts itself is integer-safe +
  overflow-guarded.
- ✅ **No secrets** — `.env` gitignored; nothing sensitive tracked. Dev-only
  login prefill correctly gated by `import.meta.env.DEV`.
- ⚠️ **Stable Code Artifacts** — plan/finding codes (`BH-05`,`C1`,`VG-01`,
  `DECISION#`,`Red Team`…) in **~55 source files**, 14 commit messages, and a few
  **user-facing** strings (ME-7). Violates `~/.claude/rules/review-audit-self-decision.md`
  ("explain the invariant, not the label") but is **pervasive pre-existing repo
  convention** (P1–P5 do the same). Decision required: adopt as house style
  (and stop flagging) or strip going forward. Regardless, remove codes from
  user-facing text (ME-7) now.

## Cleared (verified non-issues)

Gapless numbering under concurrency (FOR UPDATE, rollback-safe); sync idempotency
(full-map, per-bill tx, dedup-before-allocate, content-hash reject, never-reject-
printed); bill snapshot immutability; payments concurrency (re-read + paidAt
recheck, exact-sum); device-token binding; auth (timing-safe, atomic counters,
typ checks, TTL validation); outbox delete-only-on-official-number; sync
serialization + retry requeue; Dexie additive versioning; money.ts correctness;
price-resolver purity + branch fallback; ESC/POS byte sequences; print non-
blocking failure; admin mutation error handling; `/branches` `{data}` envelope
(intentional pagination, not a bug).

## Recommended fix batch (priority order)

1. **CR-1 + CR-2** — branch authz on path-keyed ops + bind approval PIN to branch (security).
2. **CR-3** — offline double-tap guard (data integrity on paid sales).
3. **HI-1/HI-2/HI-3** — build snapshot once + resolve client-side (perf gate + unify online/offline pricing + parity).
4. **HI-6/HI-7** — printer money validation + sync qty validation.
5. **HI-5/HI-8** — transient-error shift state + monitor stale-shift reset.
6. **ME-1/ME-4/ME-7/ME-11** — money helpers in API, effect deps, strip user-facing codes, remove bill console.log.

## Unresolved questions

1. Is chain-wide manager approval (CR-2) an intentional product decision?
2. Should offline `createdAt` be validated against server time independently of `clockOffsetMs` (HI-4)?
3. Is exact-pay-only intended, or should CASH allow over-tender + change?
4. Adopt the plan-code commenting convention as house style, or strip it?
