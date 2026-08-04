---
title: "Port toàn bộ layout DTV sang fnb admin"
slug: port-dtv-layout
created: 2026-08-04
status: draft-awaiting-approval
priority: P1
---

context: |
  User muốn "bê toàn bộ layout DTV" — hiện admin fnb vẫn khác hẳn: (1) nền KEM ẤM
  (#FAF6EF) vs DTV COOL near-white (#FAFAF8 / card #FFFFFF / header #F1F0EF / border
  #E6E5E2); (2) trang bọc trong Card có title+mô tả → LẶP tiêu đề (DTV: title chỉ ở
  PageHeader, content nằm trong panel không title); (3) component chưa khớp (button
  variants + split, input 40px, tabs underline, badge, avatar có ring, checkbox,
  dropdown, pagination); (4) typography khác (DTV: Be Vietnam Pro, h1 25/700, body 14).
  Đã scout đầy đủ token + component + composition users-roles (2 report trong hội thoại).

  BLAST RADIUS: tokens ở packages/ui/tokens.css DÙNG CHUNG admin + POS → đổi surfaces
  = re-skin cả 2 app. Cần chốt scope + màu trước khi code.

key_decisions_needed:
  - Màu primary: giữ green đậm brand (#235B54) HAY teal-green như DTV? (hỏi user)
  - Surfaces: chuyển sang cool near-white như DTV (bỏ tông kem ấm)? Ảnh hưởng cả POS.
  - Font: đổi sang Be Vietnam Pro?

## Phases (đề xuất — chờ duyệt)

| Phase | Nội dung | Ghi chú |
|-------|----------|---------|
| D0 | Foundation tokens: surfaces cool (bg #FAFAF8, card #FFF, header #F1F0EF, border #E6E5E2, foreground cool-grays), radius DTV (4/7/9/11/14), shadow e1–e4, font Be Vietnam Pro, type scale (h1 25/700, body 14). Light+dark. | Global (packages/ui) — re-skin admin+POS |
| D1 | Component library align: Button (variants + split ButtonGroup), Input 40px + InputGroup search, Select/Combobox, Tabs line (underline + count pill), Badge (dot + shapes + tones), Avatar (ring + sizes), Checkbox, DropdownMenu, Card/Panel, Separator. Tests. | Nhiều component ở @ilikebuffet/ui + admin |
| D2 | PageShell mới: chrome (PageHeader breadcrumb+title+action slots start/middle/end + split) + PageToolbar (tabs trái / search+filter phải) cố định, body cuộn riêng; Container max-w 1200/1440. Cơ chế slot để page đẩy actions/toolbar lên shell. | Thay wiring breadcrumb/pageheader hiện tại |
| D3 | DataTable khớp DTV: header 48px nền surface-header, row hover surface-header/50%, cột checkbox chọn mặc định, actions ghim phải, pagination + selection bar kiểu DTV. | Nâng _shared/table |
| D4 | Re-compose pages lên PageShell, BỎ Card(title+mô tả) lặp — pilot users-roles 1:1 (tabs Danh sách\|Vai trò, search+filter, bảng trong panel trần, action ở header), rồi 5 trang đã migrate. | Đụng page + test từng trang |
| D5 | Rollout các trang còn lại (follow-up). | Ngoài lần này |

## Acceptance (mục tiêu)
- Trang users-roles trông ~1:1 DTV: header (icon nhà › Hệ thống › **Người dùng & vai trò** + nút Thêm mới phải), toolbar (tab "Danh sách N" gạch chân + search + filter phải), bảng panel trần (không title lặp), badge trạng thái chấm màu, avatar ring, ⋮ outline, pagination "Hiển thị [10] / N + số trang".
- Surfaces cool near-white (không còn kem ấm) — theo lựa chọn màu đã chốt.
- tsc + full admin vitest + build xanh sau mỗi phase; POS build/test còn xanh (nếu đổi token global).
- Không xoá hành vi (dialog/drawer/mutation) khi re-compose.

## Rủi ro / lưu ý
- Đổi token global re-skin cả POS → cần build/test POS. Có thể scope override riêng admin nếu muốn giữ POS.
- Re-compose bỏ Card(title) có thể chạm test đang assert title/description → cập nhật selector, không weaken.
- Khối lượng lớn, nhiều phase; nên làm pilot users-roles trước để duyệt "look" rồi rollout.

## Out of scope
- Đổi routing/logic nghiệp vụ; migrate 100% bảng; đa theme-switcher như DTV (chỉ 1 theme brand).
