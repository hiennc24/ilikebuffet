/**
 * Guards against the `import type` DTO regression.
 *
 * A controller that imports a class DTO with `import type` elides it at compile
 * time, so `design:paramtypes` reflects the @Query()/@Body() param as `Function`
 * instead of the DTO. The global ValidationPipe then validates against `Function`
 * (no whitelisted props) and rejects EVERY property ("property X should not
 * exist"). Tests don't wire the global pipe, so this reproduces it: reflect each
 * handler's real metatype and run the production ValidationPipe against it.
 */
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import type { ArgumentMetadata } from "@nestjs/common";
import { UsersController } from "../src/platform/users/users.controller";
import { FinanceController } from "../src/sales/finance/finance.controller";
import { PurchaseOrdersController } from "../src/inventory/purchase-orders/purchase-orders.controller";
import { StockController } from "../src/inventory/stock/stock.controller";

// Same options as main.ts bootstrap().
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

/** The reflected metatype of a handler param (as the global pipe would receive it). */
const metatypeOf = (ctor: object, method: string, index: number) =>
  (Reflect.getMetadata("design:paramtypes", (ctor as { prototype: object }).prototype, method) as unknown[])[index];

const cases = [
  { name: "UsersController.list", ctor: UsersController, method: "list", index: 0, query: { page: "1", pageSize: "20", role: "THU_NGAN" } },
  { name: "FinanceController.list", ctor: FinanceController, method: "list", index: 0, query: { page: "1", pageSize: "20" } },
  { name: "PurchaseOrdersController.list", ctor: PurchaseOrdersController, method: "list", index: 0, query: { page: "1", pageSize: "20", status: "DRAFT" } },
  { name: "StockController.listStock", ctor: StockController, method: "listStock", index: 0, query: { page: "1", pageSize: "20" } },
];

describe("controller query DTOs are value-imported (not `import type`)", () => {
  for (const c of cases) {
    it(`${c.name}: metatype is a real DTO class and the pipe accepts a valid query`, async () => {
      const metatype = metatypeOf(c.ctor, c.method, c.index);
      // A real DTO class — NOT the Function/Object fallback of an elided import.
      expect(typeof metatype).toBe("function");
      expect((metatype as { name: string }).name).not.toBe("Function");
      expect((metatype as { name: string }).name).not.toBe("Object");
      const meta: ArgumentMetadata = { type: "query", metatype: metatype as ArgumentMetadata["metatype"], data: "" };
      await expect(pipe.transform(c.query, meta)).resolves.toBeDefined();
    });
  }
});
