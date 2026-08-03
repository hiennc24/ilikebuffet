# P0 — Fix runtime API

**Goal:** App chạy được: API build mới, port khớp Vite proxy.

## Evidence (đã chẩn đoán)
- Tiến trình :3001 = build cũ → `/sales/finance` 404. Build mới (:3009) → 401.
- `start:prod` = `node dist/main.js` sai (thật: `dist/apps/api/src/main.js`).
- `.env` PORT=3000 đụng app biso24 (Clerk) ở :3000; Vite proxy → 3001.

## Changes
- `apps/api/package.json`: `start:prod` → `node dist/apps/api/src/main.js`.
- `.env.example`: `PORT=3000` → `PORT=3001` (+ note khớp Vite proxy).
- `.env` (local, KHÔNG commit): `PORT=3001`.

## Steps
1. Sửa 2 file trên (+ .env local).
2. Rebuild API: `pnpm --filter @ilikebuffet/api build`.
3. Restart tiến trình API cũ (:3001) bằng build mới (kill tiến trình API của mình,
   khởi động lại — KHÔNG đụng tiến trình :3000 của app khác).
4. Verify: `/health` 200, `/sales/finance` 401, `/sales/reports/pnl` 401,
   `/sales/finance/payables/aging` 401 trên :3001.

## Notes
- `.env` bị gitignore → chỉ sửa cục bộ để app chạy, không commit.
- Không đổi `main.ts` (không cần CORS vì admin/POS dùng Vite same-origin proxy).
