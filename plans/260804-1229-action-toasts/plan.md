---
title: "Toast sau mỗi action (admin) — global via MutationCache"
slug: action-toasts
created: 2026-08-04
status: in-progress
priority: P2

context: |
  Admin chưa có toast. 19 trang dùng useMutation (create/edit/delete/status/pay…),
  lỗi hiện qua InlineError, thành công chỉ đóng dialog + invalidate. queryClient có
  defaultOptions nhưng CHƯA có MutationCache. Codebase đã có mẫu singleton
  module-level (theme.tsx) để tái dùng cho toast store.

decisions:
  - Global: MutationCache.onSuccess → toast.success (mặc định "Thành công",
    override qua meta.successMessage); onError → toast.error(toErrorMessage). Không
    sửa 19 trang.
  - Success mặc định cho MỌI mutation. Giữ InlineError (ngữ cảnh form) + thêm toast.
  - Toast store dạng singleton (như theme.tsx) để MutationCache (ngoài React) và
    <Toaster> cùng tham chiếu. Dark-mode-safe (dùng token). aria-live, auto-dismiss.

## Phases

| Phase | Tên | Nội dung | Status |
|-------|-----|----------|--------|
| T1 | Toast infra | src/lib/toast.tsx: store singleton + toast.success/error/info + useToasts + <Toaster/> (stack, aria-live, auto-dismiss ~4s, dismiss, on-token, safe-area, reduced-motion). Mount <Toaster/> trong app.tsx | done |
| T2 | Wire MutationCache | queryClient dùng new MutationCache({ onSuccess, onError }); onError→toast.error(toErrorMessage); onSuccess→toast.success(meta.successMessage ?? "Thành công") | done |
| T3 | Tests + verify | toast store (emit/subscribe/auto-dismiss), Toaster render, MutationCache toast on success/error; full admin suite + build | done |

## Acceptance
- Mọi mutation thành công → toast xanh (mặc định "Thành công" hoặc meta.successMessage).
- Mọi mutation lỗi → toast đỏ (thông điệp lỗi). InlineError vẫn hiển thị.
- Toast auto tắt ~4s, đóng được, không cướp focus (aria-live=polite; lỗi role=alert).
- Hoạt động ở light + dark (dùng token). Tests admin xanh; build xanh.

## Out of scope
- Toast cho export/download (không phải mutation) — có thể thêm sau.
- POS toasts.
