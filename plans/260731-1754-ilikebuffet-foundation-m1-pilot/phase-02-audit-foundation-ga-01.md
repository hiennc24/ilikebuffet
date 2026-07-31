---
phase: 2
title: "Audit Foundation (GA-01)"
status: pending
priority: P1
dependencies: [1]
---

# Phase 2: Audit Foundation (GA-01)

## Overview
Audit log **append-only, không ai xóa được** — làm sớm vì ghi log là DoD của mọi story sau. (GA-01)

## Requirements
- Functional: mỗi bản ghi có ai/vai trò, hành động, đối tượng(loại+mã), lúc nào, tại đâu(CN,thiết bị), **before/after JSON**, lý do/người duyệt.
- Non-functional: append-only tuyệt đối (không API/màn sửa-xóa); giữ ≥ 24 tháng; ghi log không làm fail giao dịch chính nhưng không được mất log của thao tác đã commit.

## Architecture
- Bảng `audit_log` (JSONB before/after). **DB role của app bị REVOKE UPDATE, DELETE** trên bảng này (chỉ INSERT/SELECT) — bất biến enforce ở tầng DB, không chỉ ở code.
- `AuditInterceptor` + decorator `@Audited({action, objectType})` — ghi trong **cùng transaction** với thao tác nghiệp vụ (log và thay đổi cùng sống/chết) cho hành động nhạy cảm; hành động read/login-fail ghi ngoài tx.
- Helper `captureBeforeAfter()` chuẩn hoá diff.
- Màn tra cứu (chỉ Chủ chuỗi/HQ/Kế toán) — lọc người/hành động/đối tượng/CN/ngày; xuất Excel (dùng lại ở P5 FE).

## Related Code Files
- Create: `apps/api/src/audit/` (module, interceptor, decorator, service), `prisma` migration `audit_log` + grant script `prisma/sql/audit-role-grants.sql`
- Modify: `prisma/schema.prisma`
- Delete: —

## TDD Steps (test-first)
1. **RED**: `audit-immutability.e2e-spec.ts` — thử UPDATE/DELETE `audit_log` bằng app role → phải bị DB từ chối (permission denied).
2. **GREEN**: migration + REVOKE grants; app connect bằng role hạn chế.
3. **RED**: `audit-interceptor.spec.ts` — thao tác `@Audited` rollback → **không** để lại audit row (cùng tx); thao tác commit → có đúng 1 row với before/after.
4. **GREEN**: interceptor + service.
5. **RED**: test danh sách phạm vi bắt buộc GA-01.1 (đăng nhập fail ≥5, truy cập chéo CN — nối ở P3).
6. **REFACTOR**: chuẩn hoá payload; index theo (CN, action, createdAt).

## Success Criteria
- [ ] App role không UPDATE/DELETE được audit_log (test chứng minh).
- [ ] Log ghi cùng tx với thao tác nhạy cảm; rollback không rác, commit không mất.
- [ ] Màn tra cứu + xuất Excel lọc đủ chiều.
- [ ] before/after JSON đúng cho ≥1 thao tác mẫu.

## Risk Assessment
- Đưa audit vào tx làm chậm hot path (tạo bill) → với bill dùng append event nhẹ; đo trong P7 load test. Nếu chậm, tách audit của bill sang outbox trong-tx (vẫn cùng tx, ghi bảng outbox) + worker đẩy.

## Red Team Hardening (2026-07-31)
- **H1 (insider/owner)** — REVOKE app role là **cần nhưng chưa đủ** (GA-01 threat "kể cả quản trị"). Thêm: (1) **BEFORE UPDATE/DELETE trigger** trên `audit_log` raise cho MỌI role trừ superuser; (2) segregation: app deploy không chạy bằng superuser/owner; (3) **export append-only ra WORM/object-lock off-box** định kỳ để xóa ở DB vẫn phát hiện được.
- **C4/AD7 (perf sớm)** — quyết định "audit trong cùng tx với bill" phải đo bằng **micro-benchmark ngay P2** (không đợi P7). Nếu chậm → chốt outbox trước khi P7 build lên.
- **C4 (lock ordering)** — audit-in-tx phải theo thứ tự lock cố định **counter → audit** (không đảo) để tránh deadlock AB/BA với bill-number service (P7).
- **Outbox correctness** — nếu dùng outbox: worker chỉ **INSERT** trên `audit_log` + **DELETE chỉ row outbox đã xử lý của chính nó**; test: thao tác commit → luôn tới `audit_log` kể cả worker crash/restart (không mất log của op đã commit).
- New success criteria: [ ] trigger chặn UPDATE/DELETE kể cả owner role (test); [ ] có job export WORM off-box; [ ] micro-bench audit-in-tx có số trước P7.
