---
phase: 4
title: "Branch & Master Data"
status: done
priority: P1
dependencies: [3]
completed: "2026-08-01"
---

# Phase 4: Branch & Master Data

## Overview
Quản lý chi nhánh (cấu hình, sao chép CN mẫu) + master data dùng chung + import Excel có preview lỗi. (NT-01, NT-03)

## Requirements
- Functional: CRUD CN (mã 2–5 ký tự viết hoa duy nhất, **không đổi sau khi có giao dịch**), trạng thái CN (Hoạt động/Tạm dừng/Đóng cửa), sao chép cấu hình từ CN mẫu (không copy giao dịch); master data: nguyên liệu (đơn vị gốc + tối đa 3 đơn vị mua có hệ số, định mức hao hụt kế thừa nhóm), sơ đồ khoản thu-chi (cây 2 cấp), NCC (điều khoản công nợ, phạm vi, luồng chờ HQ duyệt).
- Non-functional: import Excel **validate trước khi ghi** (trùng tên chuẩn hoá không dấu, thiếu trường, đơn vị lạ, hệ số ≤0); chỉ ghi dòng hợp lệ, xuất file lỗi.

## Architecture
- `platform` module mở rộng: `branches`, `master-data` (ingredients, units, chart-of-accounts, suppliers).
- Mã CN: unique constraint + rule immutable-after-transaction (guard kiểm tra tồn tại giao dịch trước khi cho sửa mã).
- CN `Tạm dừng` → chặn tạo giao dịch (ẩn/khóa nút), chỉ xem lịch sử. `Đóng cửa` không xóa cứng, vẫn vào báo cáo hợp nhất.
- Import: parse ExcelJS → **normalize tiếng Việt bỏ dấu + lowercase** để bắt trùng ("Tôm sú"/"tom su") → báo cáo dòng hợp lệ/lỗi → ghi transaction dòng hợp lệ.
- Nguyên liệu/NCC/loại đã có giao dịch: không xóa, chỉ `Ngừng sử dụng`.

## Related Code Files
- Create: `apps/api/src/platform/branches/`, `apps/api/src/platform/master-data/`, `packages/shared/src/vn-normalize.ts`, `apps/api/src/platform/import/excel-import.service.ts`
- Modify: `prisma/schema.prisma` (branch, ingredient, unit, account, supplier); `audit` (đổi trạng thái CN, sửa master data)
- Delete: —

## TDD Steps (test-first)
1. **RED**: `vn-normalize.spec.ts` — bỏ dấu + case-fold bắt trùng đúng bộ ca kiểm thử tiếng Việt.
2. **GREEN**: util normalize.
3. **RED**: `excel-import.spec.ts` — file có dòng lỗi (đơn vị lạ, hệ số ≤0, trùng, thiếu trường) → chỉ ghi dòng hợp lệ, trả đúng danh sách lỗi, không ghi 1 phần rồi hỏng.
4. **GREEN**: import service (transaction toàn bộ dòng hợp lệ).
5. **RED**: mã CN đã có giao dịch → sửa mã bị chặn; CN Tạm dừng → API tạo giao dịch bị chặn.
6. **GREEN** + **REFACTOR**: sao chép CN mẫu (copy cấu hình, không copy giao dịch) — test khẳng định không rò dữ liệu giao dịch.

## Success Criteria
- [x] Mã CN immutable sau giao dịch; unique toàn hệ thống. — `branchHasTransactions()` registry (P7 đăng ký checker); regex `^[A-Z][A-Z0-9]{1,4}$`; test inject checker.
- [x] Import Excel preview lỗi đúng, ghi nguyên tử dòng hợp lệ, xuất file lỗi. — validate-before-write, 1 tx, error workbook; **ImportController** (HQ, @Unscoped) wired (C2 fix); column-map config (H7).
- [x] Normalize tiếng Việt bắt trùng chuẩn. — `vnNormalize` (NFD + đ/Đ + lowercase); 16 test.
- [x] CN Tạm dừng/Đóng cửa hành xử đúng AC NT-01.4. — `assertBranchAcceptsTransactions()` export cho P7; CLOSED không xóa cứng.
- [~] Sao chép CN mẫu không copy giao dịch. — seam + test không rò giao dịch; **copy price-table = no-op tới P6** (ghi rõ, L3).

## Risk Assessment
- Import bán phần gây master data bẩn → luôn all-or-nothing theo lô dòng hợp lệ trong 1 tx. NCC "Chờ HQ duyệt" dùng tạm cho PO CN đó — enforce phạm vi ở guard P3.

## Red Team Hardening (2026-07-31)
- **M2 (holiday-calendar entity)** — thêm entity **lịch lễ** (năm dương + ngày tùy chọn kiểu 30 Tết, VG-02.2) vào master data P4. P6 (loại ngày Lễ) và P8 (cache offline áp giá) đều phụ thuộc — nếu không có ở P4, P6 sẽ back-fill schema chồng chéo (vi phạm 1-owner `schema.prisma`). Thêm vào Related Code Files + schema.
- **H7 (Excel = file thật)** — import/export **column-map pluggable qua config**, KHÔNG hard-code cột. `blockedBy`: "6 file mẫu kế toán thật thu Sprint 0" (needs-client-confirm #8). Không viết test import theo template tự chế (phantom test); test theo column-map + fixture từ file thật khi có.
- New success criteria: [x] holiday-calendar entity tồn tại + P6/P8 dùng — HolidayCalendar/Entry + `isHoliday(date,branchId?)` (branch→chain fallback, Asia/Ho_Chi_Minh tz). [x] import/export dùng column-map config, không hard-code cột — `INGREDIENT_COLUMN_MAP`; accounting templates (#8) deferred (needs-client-confirm).

### Implemented (251 api + 31 shared tests) + post-review fixes (DONE_WITH_CONCERNS → 9 fixed + tested)
- C1 global ValidationPipe + class-validator DTOs (factorToBase NaN, holiday date, numeric guards). C2 ImportController wired (was dead code). H1 isHoliday Asia/Ho_Chi_Minh single-normalisation (was local/UTC drift). H2 partial unique index chain-wide holiday calendar. H3 GET /branches scoped to caller's branches + bankAccount hidden from non-members. M1 seedDefaultAccounts idempotent init. M2 dedup ingredient-code (crypto.randomInt). M3 supplier list via `requireScope()`. M5 import bad defaultMinStock reported not silent.
- **Carry-forward:** P7 must call `registerTransactionChecker` (branch/ingredient) or immutability stays inert. Accounting Excel templates (#8) pending client files. Branch-directory visibility (H3) = secure default (scoped) — confirm with client if chain-visible desired.
