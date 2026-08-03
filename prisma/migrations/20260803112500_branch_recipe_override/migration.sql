-- Per-branch recipe override: branchId NULL = chain-wide default, else a branch's
-- override. Two partial unique indexes because Postgres treats NULLs as distinct,
-- so a single compound unique can't dedupe chain-wide rows.

ALTER TABLE "ticket_type_recipe" ADD COLUMN "branchId" TEXT;

DROP INDEX "ticket_type_recipe_ticketTypeId_ingredientId_key";

CREATE UNIQUE INDEX "ttr_chain_unique"
    ON "ticket_type_recipe"("ticketTypeId", "ingredientId")
    WHERE "branchId" IS NULL;
CREATE UNIQUE INDEX "ttr_branch_unique"
    ON "ticket_type_recipe"("ticketTypeId", "ingredientId", "branchId")
    WHERE "branchId" IS NOT NULL;

CREATE INDEX "ticket_type_recipe_ticketTypeId_branchId_idx"
    ON "ticket_type_recipe"("ticketTypeId", "branchId");

ALTER TABLE "ticket_type_recipe" ADD CONSTRAINT "ticket_type_recipe_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
