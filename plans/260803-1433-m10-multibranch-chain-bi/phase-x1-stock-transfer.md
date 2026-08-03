# X1 — Điều chuyển kho liên chi nhánh

**Goal:** chuyển nguyên liệu từ CN nguồn → CN đích, mang giá vốn, an toàn tồn.

## Schema (additive migration)
- `StockTransfer` { id, code, fromBranchId, toBranchId, note?, createdBy, createdAt }
  (+ FK 2 branch). Nếu chốt "tức thời" (Q1) → không cần status; nếu in-transit →
  status(SENT|RECEIVED) + receivedBy/At.
- 2 chân dùng lại `StockMovement`: ISSUE ở nguồn + RECEIPT ở đích, refType
  "TRANSFER", refId = transfer.id (truy vết cặp).

## Service (`inventory/transfers`)
- `transfer({ fromBranchId, toBranchId, ingredientId, qtyBase, note }, actor, access)`:
  - fromBranchId != toBranchId; assertBranchAccess CẢ HAI đầu (hoặc chain-wide).
  - Trong tx: đọc avg cost CN nguồn; `applyDelta` ISSUE ở nguồn (chặn âm — đây là
    di chuyển thực, không cho âm); `applyDelta` RECEIPT ở đích với unitCost = avg
    nguồn (đích blend moving-avg). Ghi StockTransfer + audit `stock.transfer`.
  - (Nếu in-transit: SENT ghi ISSUE nguồn; RECEIVED ghi RECEIPT đích — 2 bước.)
- Reuse `InventoryBalanceService`; KHÔNG đổi lõi moving-avg.

## Frontend (`stock-transfer-page.tsx`)
- Chọn CN nguồn/đích + nguyên liệu + số lượng + ghi chú → tạo; danh sách phiếu
  chuyển. Reuse Select/Dialog/DataTable. Route `/inventory/transfers`, nav + rbac
  (INVENTORY_WRITE_ROLES + access 2 CN / chain-wide).

## Tests (e2e)
- Chuyển 5kg: nguồn −5 (chặn nếu >tồn), đích +5, đích mang giá vốn nguồn (blend đúng).
- Access 2 đầu: thiếu quyền 1 CN → 403.
- `balance == Σ movements` cả 2 CN; movement cặp refType TRANSFER cùng refId.

## Risks
- Giá vốn: đích blend theo avg nguồn (Q4). Chặn âm ở nguồn (khác consumption).
- Thứ tự khóa 2 balance row → khóa theo thứ tự branchId ổn định tránh deadlock.
