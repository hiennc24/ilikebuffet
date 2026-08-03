# P2 — Màn Vai trò & phân quyền

**Goal:** Admin xem được ma trận capability × vai trò (read-only).

## Backend (`apps/api/src/platform/rbac`)
- Thêm `rbac.controller.ts` (`@Controller("rbac")`): `@Get("capabilities")` →
  `{ roles: Role[], capabilities: Capability[], matrix: Record<Role, Capability[]> }`
  từ `ROLE_CAPABILITIES` (permissions.ts). Read-only, không DB.
- Guard: vai trò xem được = QUAN_TRI_HQ (+ QUAN_LY_CN?) — dùng set nhỏ; branch-scope
  không cần (dữ liệu tĩnh toàn cục). Ném Forbidden nếu không đủ quyền.
- Đăng ký controller vào module phù hợp (tạo `rbac.module.ts` hoặc thêm vào
  PlatformModule/AppModule — theo cách module hiện có).

## Frontend (`apps/admin/src/pages/permissions-page.tsx`)
- Fetch `/rbac/capabilities`; render bảng: hàng = capability, cột = 6 vai trò, ô =
  ✓/– (Badge/ký hiệu). Nhãn vai trò tiếng Việt (tái dùng ROLE_LABEL nếu có).
- Read-only; mô tả rõ "Ma trận quản lý ở cấu hình hệ thống (code)".
- Route `/settings/permissions` trong app.tsx (RequireAccess), nav "Vai trò & phân
  quyền" dưới nhóm Hệ thống, rbac.ts hạn chế {QUAN_TRI_HQ} (+ QUAN_LY_CN nếu chọn),
  query-keys `rbacCapabilities`.

## Tests
- API: `test/rbac-capabilities.e2e-spec.ts` — trả matrix đúng vài ô đã biết (vd
  cash:create-voucher: THU_NGAN true, THU_KHO false); role thường → 403.
- FE: permissions-page test — render bảng, có ✓ ở ô đã biết.

## Notes
- Không cho sửa matrix (YAGNI) — chỉ hiển thị. Nguồn sự thật vẫn là permissions.ts.
