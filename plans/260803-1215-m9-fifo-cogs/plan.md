---
title: "M9 — Giá vốn thực tế theo lô (FIFO, song song)"
slug: m9-fifo-cogs
created: 2026-08-03
status: done
priority: P1
mode: --tdd

decisions:
  - approach: FIFO song song — GIỮ moving-average cho tồn hiện tại; thêm góc nhìn
    giá vốn FIFO. Additive, không refactor lõi tồn kho (M4–M8 nguyên vẹn).
  - lots: KHÔNG thêm bảng StockLot — movement RECEIPT đã là "lô" (qtyBase vào +
    unitCostVnd thực). FIFO tính bằng replay ledger StockMovement (DRY).
---

# M9 — Giá vốn thực tế theo lô (FIFO)

Mục tiêu: cung cấp **giá vốn FIFO** (theo lô nhập thực) song song với moving-average
hiện có, để đối chiếu lãi gộp chính xác hơn khi giá nhập biến động. Không thay đổi
cách tính tồn/giá vốn TB hiện tại (an toàn, additive).

**Bối cảnh (đã scout):** `StockMovement` đã ghi đủ: RECEIPT = lô (qtyBase +unitCostVnd
thực), outflow ISSUE/BILL (refType "BILL"→bán, refId=billId), ADJUST (kiểm kê),
BILL_REVERSAL (hoàn). ⇒ FIFO tính được bằng replay ledger theo thứ tự createdAt,
KHÔNG cần bảng lô riêng, KHÔNG hook outflow, KHÔNG đổi InventoryBalance.

## FIFO engine (thuần hàm)
- Duyệt movement theo createdAt, giữ hàng đợi lô {qtyRemaining, unitCost}:
  - qty>0 (RECEIPT/REVERSAL): đẩy lô {qty, unitCostVnd}.
  - qty<0 (ISSUE/BILL): tiêu từ đầu hàng đợi; cost = Σ lấy×giá-lô. Nếu refType
    "BILL" → cộng vào COGS bán (bucket theo businessDate của bill).
  - ADJUST: delta<0 → tiêu FIFO (hao hụt, không phải COGS bán); delta>0 → đẩy lô
    ở unitCostVnd (≈ avg lúc đó).
  - Thiếu lô (bán quá tồn, tồn âm): phần thiếu định giá theo giá lô gần nhất/
    unitCostVnd của movement (ghi rõ giả định).
- Output: tổng FIFO COGS bán + theo ngày.

## Phases

| Phase | Tên | Nội dung | Phụ thuộc | Status |
|-------|-----|----------|-----------|--------|
| L0 | [FIFO engine](./phase-l0-engine.md) | hàm FIFO thuần (replay movements → COGS bán theo lô) + unit tests | — | ✅ done |
| L1 | [Report + FE](./phase-l1-report-fe.md) | endpoint FIFO COGS theo kỳ/chi nhánh (so với moving-avg) + hiển thị ở lãi gộp + docs + verify | L0 | ✅ done |

## Acceptance
- FIFO COGS đúng qua ví dụ nhiều lô (giá khác nhau) — khớp tay.
- Song song: tồn hiện tại + moving-average GIỮ NGUYÊN; không hồi quy M4–M8.
- Report FIFO theo kỳ/chi nhánh; hiển thị cạnh giá vốn TB ở lãi gộp.
- Toàn bộ test API/admin/shared xanh.

## Open questions
- Bucket theo businessDate (khớp doanh thu) — xác nhận khi review; movement tiêu
  theo createdAt nhưng gán COGS theo ngày của bill.
