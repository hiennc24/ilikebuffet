/**
 * BH-02.6 load test — bill creation under 5× pilot load.
 *
 * Target load: 2 counters × 4 bills/min = 8 bills/min baseline, ×5 = 40 bills/min,
 * sustained 30 minutes. Perf gate: p95 of bill creation < 1s, and the gapless
 * numbering must not collide under contention (checked by unique-number count).
 *
 * This is an OPERATIONAL verification (run against a prod-like stack), not a unit
 * test. Run:
 *   BASE_URL=http://localhost:3001 BRANCH_ID=... SHIFT_ID=... DEVICE_ID=... \
 *   TICKET_TYPE_ID=... CASHIER_USER=thungan@ilikebuffet.vn CASHIER_PASS=Password123 \
 *   k6 run load-test/bill-create-load.js
 *
 * Notes:
 *   - Seed a branch, price book, an OPEN shift for DEVICE_ID, and a cashier first.
 *   - The perf gate (thresholds) fails the run if p95 ≥ 1s or any bill errors.
 *   - After the run, verify numbering: the count of distinct bill.number for the
 *     branch+date equals the number of committed bills (no duplicates, no gap) —
 *     e.g. `SELECT count(*), count(distinct number) FROM bill WHERE ...`.
 */

import http from "k6/http";
import { check } from "k6";
import { Trend, Counter } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:3001";
const BRANCH_ID = __ENV.BRANCH_ID;
const SHIFT_ID = __ENV.SHIFT_ID;
const DEVICE_ID = __ENV.DEVICE_ID || "loadtest-device";
const TICKET_TYPE_ID = __ENV.TICKET_TYPE_ID;
const CASHIER_USER = __ENV.CASHIER_USER || "thungan@ilikebuffet.vn";
const CASHIER_PASS = __ENV.CASHIER_PASS || "Password123";

const billLatency = new Trend("bill_create_latency", true);
const billErrors = new Counter("bill_create_errors");

export const options = {
  scenarios: {
    // 5× the 2-counter × 4-bills/min baseline = 40 bills/min, 30 minutes.
    pilot_5x: {
      executor: "constant-arrival-rate",
      rate: 40,
      timeUnit: "1m",
      duration: "30m",
      preAllocatedVUs: 10,
      maxVUs: 30,
    },
  },
  thresholds: {
    // BH-02.6 perf gate.
    bill_create_latency: ["p(95)<1000"],
    bill_create_errors: ["count==0"],
  },
};

export function setup() {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ username: CASHIER_USER, password: CASHIER_PASS }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, { "login 201": (r) => r.status === 201 });
  return { token: res.json("accessToken") };
}

export default function (data) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.token}`,
    "x-branch-id": BRANCH_ID,
  };
  const body = JSON.stringify({
    branchId: BRANCH_ID,
    deviceId: DEVICE_ID,
    shiftId: SHIFT_ID,
    lines: [{ ticketTypeId: TICKET_TYPE_ID, qty: 2 }],
  });

  const res = http.post(`${BASE}/sales/bills`, body, { headers });
  billLatency.add(res.timings.duration);
  const ok = check(res, {
    "bill created": (r) => r.status === 201 || r.status === 200,
    "has number": (r) => !!r.json("number"),
  });
  if (!ok) billErrors.add(1);
}
