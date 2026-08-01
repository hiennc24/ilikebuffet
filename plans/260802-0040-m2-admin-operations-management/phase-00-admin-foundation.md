# P0 — Admin list-screen foundation

**Goal:** shared building blocks so every list screen (P1–P5) is consistent and cheap.
Unblocks all other phases.

## Requirements
- `DataTable` component (deferred from M1): columns config, sortable header, row click,
  loading/empty/error slots, sticky header, touch-friendly. Design-token styled.
- `usePagedList` hook: wraps react-query + ApiClient; params `{page,pageSize,filters}`;
  tolerates both `{data,total}` envelope (platform) and bare arrays (sales) via the
  existing `unwrapList` shim.
- `Pagination`, `FilterBar` (search input + selects), `DetailDrawer` (slide-over panel).
- Page scaffold pattern: title + FilterBar + DataTable + Pagination + DetailDrawer.
- Nav + routes wired for the new screens (hidden behind RBAC — real guard in P6, stub role
  check here): `/orders`, `/branches`, `/master-data/*`, `/users`, `/devices`, `/audit`.

## Files
- create `apps/admin/src/pages/_shared/data-table.tsx`, `pagination.tsx`, `filter-bar.tsx`,
  `detail-drawer.tsx`
- create `apps/admin/src/lib/use-paged-list.ts`
- modify `apps/admin/src/app.tsx` (routes), `apps/admin/src/layout/admin-shell.tsx` (nav → real routes)
- modify `apps/admin/src/lib/query-keys.ts` (keys for orders/users/devices/audit/master-data)
- reuse `_shared/admin-ui.tsx` (`Select`, `InlineError`)

## Steps (TDD)
1. Test: DataTable renders rows/empty/loading/error; row click fires; sort toggles.
2. Test: usePagedList maps envelope+array, passes page/filter params to the client.
3. Implement components + hook.
4. Wire routes + nav; add a placeholder page per route (real content in later phases).

## Tests
- `data-table.test.tsx`, `use-paged-list.test.ts`, nav/route smoke.

## Risks
- Over-engineering the table (YAGNI): only build columns/sort/slots actually needed now.
- Keep envelope handling in one place (`unwrapList`), don't duplicate.
