# Go-Live Checklist — CN1 Pilot (M1)

Operational readiness for the first real-sales pilot at Chi nhánh 1. Owner signs
each section. Do not go live with any **blocking** item open.

## 1. Master data (initial)

- [ ] Branch created with the correct **immutable code** (used in bill numbers).
- [ ] Operating hours + bank account (VietQR) + bill header configured.
- [ ] **Sepay webhook** configured → `POST /webhooks/sepay` with the `Apikey`
      header = `SEPAY_API_KEY`; smoke-tested (a test transfer creates a
      `bank_transaction` row); auto-reconcile confirmed on a scan-and-pay
      (deploy guide §7).
- [ ] **Price book signed off by the client** (Excel export approved) and its
      version is effective from the go-live date. Future-dated versions, if any,
      are correct.
- [ ] Ticket types (incl. free tickets) with colors/order.
- [ ] Time windows cover operating hours with no gaps/overlaps.
- [ ] Holiday calendar entries for the pilot period.
- [ ] Discount programs / voucher quotas (if used) configured.

## 2. Users, roles & PINs

- [ ] Cashier (THU_NGAN) accounts created, assigned to CN1.
- [ ] Manager (QUAN_LY_CN) account with an **approval PIN** set (for over-threshold
      discounts, bill cancel, shift force-close).
- [ ] Admin/owner accounts as needed. `mustChangePassword` verified on first login.

## 3. Devices & hardware

- [ ] Each POS counter **device registered** (server-issued deviceId + secret);
      PIN quick-login tested.
- [ ] **Thermal printer (80mm) tested** on each counter via the print-agent — a
      real print, not a mock. Two printer models pinned (BH-04.6) with a fallback.
- [ ] Print-agent transport verified (localhost reachable from the PWA; H6).

## 4. Correctness gates (must be green)

- [ ] Gapless numbering **concurrency test** green; **load test (BH-02.6)** passed
      (p95 bill < 1s at 5× load, 30 min, no duplicate numbers). See `load-test/`.
- [ ] Offline scenarios (BH-05.6 a–g) pass; offline sell → sync → official number
      verified end-to-end on a real device.
- [ ] Cross-branch access returns 403 automatically.
- [ ] Audit log append-only (insider-resistant) confirmed.

## 5. Disaster recovery

- [ ] WAL archiving + daily base backup enabled.
- [ ] **DR drill performed** with a named owner + date; all §2.3 criteria in
      `deployment-guide.md` met (no duplicate number, counter reconciled from
      `MAX(bills)`, temp bills reconcile).

## 6. Monitoring

- [ ] Health/uptime + error tracking live.
- [ ] Stuck-sync (>15 min) and shift-variance alerts verified.

## 7. Pilot operation

- [ ] **Two-week parallel run** planned (new system beside the current process);
      daily totals reconciled between the two.
- [ ] Rollback plan documented (revert to current process) if a blocking issue
      appears during the pilot.

---

**Sign-off**

| Area | Owner | Date | Status |
|---|---|---|---|
| Master data | | | |
| Users/PINs | | | |
| Devices/printers | | | |
| Correctness gates | | | |
| DR drill | | | |
| Monitoring | | | |
| Pilot plan | | | |
