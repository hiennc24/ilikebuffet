-- Phase 4: Branch & Master Data
-- Hand-authored to avoid shadow-DB collision on _health_probe SERIAL (Prisma flakiness note in plan).
-- Adds: Branch fields (NT-01), Unit, IngredientGroup, Ingredient, IngredientPurchaseUnit,
--       AccountGroup, Account, Supplier, SupplierIngredient, HolidayCalendar, HolidayEntry.

-- ─── Enums ────────────────────────────────────────────────────────────────────

-- CreateEnum: IngredientStatus
CREATE TYPE "IngredientStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum: AccountFlow
CREATE TYPE "AccountFlow" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum: SupplierScope
CREATE TYPE "SupplierScope" AS ENUM ('CHAIN_WIDE', 'BRANCH_SPECIFIC');

-- CreateEnum: SupplierStatus
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'PENDING_HQ', 'INACTIVE');

-- ─── Extend Branch (NT-01.1 / NT-01.2) ───────────────────────────────────────

ALTER TABLE "branch"
    ADD COLUMN "address"        TEXT NOT NULL DEFAULT '',
    ADD COLUMN "phone"          VARCHAR(20) NOT NULL DEFAULT '',
    ADD COLUMN "operatingHours" JSONB,
    ADD COLUMN "bankAccount"    JSONB,
    ADD COLUMN "billInfo"       JSONB,
    ADD COLUMN "logoUrl"        TEXT;

-- Remove the bootstrap defaults (they only exist for the NOT NULL constraint on existing rows).
ALTER TABLE "branch"
    ALTER COLUMN "address" DROP DEFAULT,
    ALTER COLUMN "phone"   DROP DEFAULT;

-- ─── Unit catalog ─────────────────────────────────────────────────────────────

CREATE TABLE "unit" (
    "id"        TEXT NOT NULL,
    "code"      VARCHAR(20) NOT NULL,
    "name"      TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unit_code_key" ON "unit"("code");

-- ─── Ingredient groups & ingredients ─────────────────────────────────────────

CREATE TABLE "ingredient_group" (
    "id"               TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "defaultWastagePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_group_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ingredient_group_name_key" ON "ingredient_group"("name");

CREATE TABLE "ingredient" (
    "id"              TEXT NOT NULL,
    "code"            VARCHAR(20) NOT NULL,
    "name"            TEXT NOT NULL,
    "groupId"         TEXT NOT NULL,
    "unitId"          TEXT NOT NULL,
    "wastagePct"      DECIMAL(5,2),
    "defaultMinStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "status"          "IngredientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ingredient_code_key" ON "ingredient"("code");

ALTER TABLE "ingredient"
    ADD CONSTRAINT "ingredient_groupId_fkey"
        FOREIGN KEY ("groupId") REFERENCES "ingredient_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ingredient"
    ADD CONSTRAINT "ingredient_unitId_fkey"
        FOREIGN KEY ("unitId") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Up to 3 purchase units per ingredient with conversion factor.
CREATE TABLE "ingredient_purchase_unit" (
    "id"           TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "unitId"       TEXT NOT NULL,
    "factorToBase" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "ingredient_purchase_unit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ingredient_purchase_unit_ingredientId_unitId_key"
    ON "ingredient_purchase_unit"("ingredientId", "unitId");

ALTER TABLE "ingredient_purchase_unit"
    ADD CONSTRAINT "ingredient_purchase_unit_ingredientId_fkey"
        FOREIGN KEY ("ingredientId") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingredient_purchase_unit"
    ADD CONSTRAINT "ingredient_purchase_unit_unitId_fkey"
        FOREIGN KEY ("unitId") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Chart of accounts (NT-03.4) ─────────────────────────────────────────────

CREATE TABLE "account_group" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_group_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_group_name_key" ON "account_group"("name");

CREATE TABLE "account" (
    "id"                   TEXT NOT NULL,
    "groupId"              TEXT NOT NULL,
    "name"                 TEXT NOT NULL,
    "flow"                 "AccountFlow" NOT NULL,
    "approvalThresholdVnd" INTEGER NOT NULL DEFAULT 0,
    "createdAt"            TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_groupId_name_key" ON "account"("groupId", "name");

ALTER TABLE "account"
    ADD CONSTRAINT "account_groupId_fkey"
        FOREIGN KEY ("groupId") REFERENCES "account_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Suppliers (NT-03.5) ─────────────────────────────────────────────────────

CREATE TABLE "supplier" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "taxCode"   VARCHAR(20),
    "contact"   TEXT,
    "debtTerms" INTEGER NOT NULL DEFAULT 0,
    "scope"     "SupplierScope" NOT NULL DEFAULT 'CHAIN_WIDE',
    "status"    "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "branchId"  TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "supplier"
    ADD CONSTRAINT "supplier_branchId_fkey"
        FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Many-to-many: supplier ↔ ingredient
CREATE TABLE "supplier_ingredient" (
    "supplierId"   TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,

    CONSTRAINT "supplier_ingredient_pkey" PRIMARY KEY ("supplierId", "ingredientId")
);

ALTER TABLE "supplier_ingredient"
    ADD CONSTRAINT "supplier_ingredient_supplierId_fkey"
        FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_ingredient"
    ADD CONSTRAINT "supplier_ingredient_ingredientId_fkey"
        FOREIGN KEY ("ingredientId") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Holiday calendar (Red Team M2) ──────────────────────────────────────────

CREATE TABLE "holiday_calendar" (
    "id"        TEXT NOT NULL,
    "year"      INTEGER NOT NULL,
    "name"      TEXT NOT NULL,
    "branchId"  TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holiday_calendar_pkey" PRIMARY KEY ("id")
);

-- Unique calendar per (year, branchId) — NULL branchId = chain-wide.
CREATE UNIQUE INDEX "holiday_calendar_year_branchId_key" ON "holiday_calendar"("year", "branchId");

CREATE TABLE "holiday_entry" (
    "id"         TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "date"       DATE NOT NULL,
    "name"       TEXT NOT NULL,
    "isCustom"   BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "holiday_entry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "holiday_entry_calendarId_date_key" ON "holiday_entry"("calendarId", "date");

ALTER TABLE "holiday_entry"
    ADD CONSTRAINT "holiday_entry_calendarId_fkey"
        FOREIGN KEY ("calendarId") REFERENCES "holiday_calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
