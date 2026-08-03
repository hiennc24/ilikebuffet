# X2 — So sánh chi nhánh + docs

**Goal:** báo cáo xếp hạng/so sánh CN + xuất Excel; docs; full verify.

## Backend (`sales/reports`)
- Tận dụng `chainOverview` (X0) làm nguồn so sánh; thêm
  `GET /sales/reports/chain-overview/export` → ExcelJS (mirror export doanh thu):
  cột CN, doanh thu thuần, số bill, khách, chênh lệch tiền ca, tồn thấp + dòng tổng.
- (Tuỳ) thêm sắp xếp theo tiêu chí (net/margin) qua query `sortBy`.

## Frontend
- Màn dashboard chuỗi (X0): thêm nút "Xuất Excel" + cho sắp cột theo doanh thu/
  chênh lệch. Nhãn xếp hạng (#1..#n).

## Docs
- `docs/project-roadmap.md`: M10 done (multi-branch & BI + điều chuyển kho).
- `docs/system-architecture.md`: bổ sung luồng điều chuyển kho + góc nhìn chuỗi.

## Verify (cross-cutting)
- API unit+e2e xanh (reports + inventory không hồi quy). admin/shared build+test+lint xanh.
- Khẳng định moving-average + tồn hiện tại KHÔNG đổi (transfer chỉ dịch chuyển).

## Risks
- Export xlsx: assert Content-Type + Content-Disposition (không assert body binary).
