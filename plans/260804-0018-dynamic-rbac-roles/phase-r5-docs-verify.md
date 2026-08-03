# R5 — Docs + full verify

**Goal:** Tài liệu RBAC động + kiểm thử toàn phần + report.

## Docs
- `docs/system-architecture.md`: mục RBAC — chuyển từ enum cứng sang DB-backed roles
  + capability catalog (code) + resolver/cache; hiệu lực-ngay; migrate gates.
- Ghi rõ: capability do CODE enforce (catalog cố định); ROLE là dữ liệu (CRUD).

## Verify (full)
- API: prisma generate; tsc + eslint; `--runInBand` toàn bộ (kỳ vọng chỉ flake
  branch-scope/bill-cancel đã biết). Chú ý các suite RBAC/endpoint (hành vi giữ nguyên).
- Admin: full vitest + tsc + eslint + build.
- Smoke chạy thật trên :3001 (dev watch): tạo vai trò custom + gán quyền → user vai trò
  đó gọi endpoint tương ứng 200; bỏ quyền → 403 ngay (cache invalidate).

## Finalize
- Cập nhật plan.md → done; commit từng phase; report + hỏi push.
