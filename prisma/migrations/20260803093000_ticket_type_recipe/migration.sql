-- Per-ticket-type ingredient recipe (định mức) for auto stock-deduction on sale.
CREATE TABLE "ticket_type_recipe" (
    "id" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyBase" DECIMAL(12,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_type_recipe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_type_recipe_ticketTypeId_ingredientId_key"
    ON "ticket_type_recipe"("ticketTypeId", "ingredientId");
CREATE INDEX "ticket_type_recipe_ticketTypeId_idx" ON "ticket_type_recipe"("ticketTypeId");

ALTER TABLE "ticket_type_recipe" ADD CONSTRAINT "ticket_type_recipe_ticketTypeId_fkey"
    FOREIGN KEY ("ticketTypeId") REFERENCES "ticket_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_type_recipe" ADD CONSTRAINT "ticket_type_recipe_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
