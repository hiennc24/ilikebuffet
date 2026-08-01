-- P6: Ticket Types & Price Matrix
-- Adds: TicketType, TimeWindow, PriceBookVersion, PriceCell, BranchPriceFlag,
--       DiscountProgram, DiscountReason + new enums.

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE "TicketTypeStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "DiscountKind" AS ENUM ('PERCENT', 'FIXED_AMOUNT', 'VOUCHER');
CREATE TYPE "DiscountProgramStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- ─── ticket_type ─────────────────────────────────────────────────────────────

CREATE TABLE "ticket_type" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "color"        VARCHAR(20) NOT NULL DEFAULT '#3B82F6',
    "isFree"       BOOLEAN NOT NULL DEFAULT false,
    "status"       "TicketTypeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_type_pkey" PRIMARY KEY ("id")
);

-- ─── time_window ─────────────────────────────────────────────────────────────

CREATE TABLE "time_window" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "startMinute"  INTEGER NOT NULL,
    "endMinute"    INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_window_pkey" PRIMARY KEY ("id")
);

-- ─── price_book_version ───────────────────────────────────────────────────────

CREATE TABLE "price_book_version" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "branchId"      TEXT,
    "createdAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"     TEXT,

    CONSTRAINT "price_book_version_pkey" PRIMARY KEY ("id")
);

-- ─── price_cell ───────────────────────────────────────────────────────────────

CREATE TABLE "price_cell" (
    "id"           TEXT NOT NULL,
    "versionId"    TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "timeWindowId" TEXT NOT NULL,
    "dayType"      VARCHAR(20) NOT NULL,
    "priceVnd"     INTEGER NOT NULL,
    "branchId"     TEXT,

    CONSTRAINT "price_cell_pkey" PRIMARY KEY ("id")
);

-- Unique: one price per (version, ticket, window, dayType, branch).
-- branchId IS NULL rows (chain-wide) are handled via the standard unique constraint
-- (Postgres considers two NULLs as distinct in B-tree, but that's fine because we
-- always INSERT with an explicit (version, ticket, window, dayType, NULL) combination
-- and the service prevents duplicates at the application layer too).
CREATE UNIQUE INDEX "price_cell_versionId_ticketTypeId_timeWindowId_dayType_branchId_key"
    ON "price_cell" ("versionId", "ticketTypeId", "timeWindowId", "dayType", "branchId")
    WHERE "branchId" IS NOT NULL;

CREATE UNIQUE INDEX "price_cell_chain_wide_unique"
    ON "price_cell" ("versionId", "ticketTypeId", "timeWindowId", "dayType")
    WHERE "branchId" IS NULL;

-- ─── branch_price_flag ────────────────────────────────────────────────────────

CREATE TABLE "branch_price_flag" (
    "branchId"      TEXT NOT NULL,
    "allowOwnPrice" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "branch_price_flag_pkey" PRIMARY KEY ("branchId")
);

-- ─── discount_program ─────────────────────────────────────────────────────────

CREATE TABLE "discount_program" (
    "id"              TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "kind"            "DiscountKind" NOT NULL,
    "pct"             INTEGER,
    "amountVnd"       INTEGER,
    "voucherCode"     VARCHAR(100),
    "quotaTotal"      INTEGER,
    "quotaRemaining"  INTEGER,
    "validFrom"       DATE,
    "validUntil"      DATE,
    "branchScope"     JSONB,
    "status"          "DiscountProgramStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_program_pkey" PRIMARY KEY ("id")
);

-- Case-insensitive voucher code lookup index.
CREATE INDEX "discount_program_voucherCode_lower_idx"
    ON "discount_program" (LOWER("voucherCode"))
    WHERE "voucherCode" IS NOT NULL;

-- ─── discount_reason ─────────────────────────────────────────────────────────

CREATE TABLE "discount_reason" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_reason_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discount_reason_name_key" ON "discount_reason" ("name");

-- ─── Foreign keys ─────────────────────────────────────────────────────────────

ALTER TABLE "price_cell"
    ADD CONSTRAINT "price_cell_versionId_fkey"
        FOREIGN KEY ("versionId") REFERENCES "price_book_version" ("id") ON DELETE CASCADE,
    ADD CONSTRAINT "price_cell_ticketTypeId_fkey"
        FOREIGN KEY ("ticketTypeId") REFERENCES "ticket_type" ("id"),
    ADD CONSTRAINT "price_cell_timeWindowId_fkey"
        FOREIGN KEY ("timeWindowId") REFERENCES "time_window" ("id");
