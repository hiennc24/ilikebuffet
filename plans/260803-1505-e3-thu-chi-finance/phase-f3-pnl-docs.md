# F2 — Báo cáo lãi/lỗ (P&L) + docs

**Goal:** P&L = doanh thu thuần − giá vốn − chi phí vận hành; docs; full verify.

## Backend (`sales/reports`)
- `GET /sales/reports/pnl?from&to&branchId&groupBy(day|branch)` — role chain-level
  hoặc report roles. Ghép:
  - netRevenueVnd: như `grossMargin` (Σ COMPLETED − refunds, theo businessDate).
  - cogsVnd: giá vốn tiêu hao (moving-avg, như consumption/grossMargin). (Q4)
  - opexVnd: Σ FinancialTransaction EXPENSE trong kỳ (loại trừ giá vốn nếu account
    "mua nguyên liệu" đã tính COGS? — MVP: opex = tất cả EXPENSE; ghi chú tránh
    đếm 2 lần nếu dùng account mua NL. Nêu rõ.)
  - grossProfit = net − cogs; netProfit = grossProfit − opex; %biên.
- `GET /sales/reports/pnl/export` → ExcelJS.

## Frontend
- Màn P&L (hoặc thêm KPI vào lãi gộp): doanh thu thuần / giá vốn / lãi gộp / chi phí
  / lãi ròng / %biên; bảng theo ngày/CN + xuất Excel.

## Docs
- `docs/project-roadmap.md`: E3 done; backlog còn E4 (công nợ/duyệt mua hàng).
- `docs/system-architecture.md`: module finance + luồng P&L.

## Verify
- API unit+e2e xanh (reports/finance không hồi quy). admin/shared build+test+lint xanh.

## Risks
- **Đếm 2 lần giá vốn:** nếu chi phí "mua nguyên liệu" ghi qua thu-chi VÀ đã tính
  COGS tiêu hao → trùng. MVP: P&L dùng COGS tiêu hao; opex chỉ gồm chi phí vận hành
  (lương/thuê/điện nước…), khuyến nghị KHÔNG hạch toán mua NL qua thu-chi. Ghi rõ.
