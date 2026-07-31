-- H2 fix: Postgres NULLs are distinct in standard unique constraints, so the
-- @@unique([year, branchId]) from schema.prisma generates a btree unique index
-- that allows multiple rows with (year, NULL) — any two chain-wide calendars
-- for the same year would silently coexist.
--
-- The fix is a PARTIAL unique index scoped to rows where branchId IS NULL.
-- This correctly enforces "at most one chain-wide calendar per year" while
-- leaving multi-branch calendars governed by the regular compound unique index.
--
-- The existing compound unique index (covers non-NULL branchId rows) is kept.

CREATE UNIQUE INDEX "holiday_calendar_chain_wide_year_unique"
    ON "holiday_calendar" ("year")
    WHERE "branchId" IS NULL;
