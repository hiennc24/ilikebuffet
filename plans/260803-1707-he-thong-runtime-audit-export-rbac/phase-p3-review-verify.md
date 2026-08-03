# P3 — Rà soát + verify

**Goal:** Xác nhận 3 màn Hệ thống chạy đúng + verify toàn phần + report.

## Review (3 màn hiện có)
- Chi nhánh / Người dùng-vai trò / Nhật ký: đã có backend + FE + test. Rà nhanh:
  route được đăng ký, guard đúng, Vite proxy phủ đủ root (/branches /users /audit).
- Xác nhận không có route @Controller nào admin cần mà thiếu trong Vite proxy.

## Verify (full)
- API: tsc + eslint + `--runInBand` (kỳ vọng chỉ flake branch-scope đã biết).
- Admin: full vitest + tsc + eslint + build.
- Smoke: build mới trên throwaway port → /audit/export 401, /rbac/capabilities 401
  (route có mặt).

## Docs
- `docs/system-architecture.md`: ghi chú audit-export UI + rbac read-only endpoint
  (nếu đáng). `docs/deployment-guide.md`: nêu PORT=3001 + start:prod path đúng.

## Finalize
- Cập nhật plan.md → done; commit từng phase; report + hỏi push.
