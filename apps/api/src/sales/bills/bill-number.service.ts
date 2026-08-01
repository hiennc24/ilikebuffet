import { Injectable } from "@nestjs/common";
import { TxClient } from "../../prisma/prisma.service";

/** Result of allocating one bill number. */
export interface AllocatedNumber {
  /** Monotonic per (branch, businessDate) sequence, starting at 1. */
  seq: number;
  /** Human number "[CODE]-[YYMMDD]-[NNNN]". */
  number: string;
}

/**
 * Gapless per-(branch, business date) bill numbering.
 *
 * `allocate` runs INSIDE the caller's bill-create transaction. It creates the
 * day's counter row on first use, then locks it with SELECT … FOR UPDATE so
 * concurrent allocations serialize — no duplicates, no skips. Because the number
 * is derived from a locked-and-incremented row (NOT a SEQUENCE), a rolled-back
 * transaction releases the lock with `lastNo` unchanged, so the next transaction
 * reuses the same number and the issued range stays gapless. Cancelling a bill
 * keeps its number (cancellation never touches the counter), so the range has no
 * hole there either.
 *
 * Lock order is fixed counter → audit (never reversed) to avoid AB/BA deadlocks.
 * The caller must dedup by (deviceId, clientUuid) BEFORE calling allocate so an
 * offline re-sync doesn't consume a second number.
 */
@Injectable()
export class BillNumberService {
  /**
   * @param tx           the surrounding bill-create transaction client
   * @param branchCode   branch short code for the number prefix (e.g. "CN01")
   * @param branchId     branch id (counter key)
   * @param businessDate VN calendar day as "YYYY-MM-DD" (counter key + number date part)
   */
  async allocate(
    tx: TxClient,
    branchCode: string,
    branchId: string,
    businessDate: string,
  ): Promise<AllocatedNumber> {
    // Create the counter row on the day's first bill (idempotent under races).
    await tx.$executeRaw`
      INSERT INTO "bill_counter" ("branchId", "businessDate", "lastNo")
      VALUES (${branchId}, ${businessDate}::date, 0)
      ON CONFLICT ("branchId", "businessDate") DO NOTHING
    `;

    // Serialize concurrent allocations on this counter row.
    const rows = await tx.$queryRaw<Array<{ lastNo: number }>>`
      SELECT "lastNo" FROM "bill_counter"
      WHERE "branchId" = ${branchId} AND "businessDate" = ${businessDate}::date
      FOR UPDATE
    `;
    const seq = (rows[0]?.lastNo ?? 0) + 1;

    await tx.$executeRaw`
      UPDATE "bill_counter" SET "lastNo" = ${seq}
      WHERE "branchId" = ${branchId} AND "businessDate" = ${businessDate}::date
    `;

    // "YYYY-MM-DD" → "YYMMDD"
    const datePart = businessDate.slice(2).replace(/-/g, "");
    const number = `${branchCode}-${datePart}-${String(seq).padStart(4, "0")}`;
    return { seq, number };
  }
}
