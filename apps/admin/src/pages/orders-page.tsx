/**
 * OrdersPage — admin bill lookup (branch-scoped), detail, and refund.
 *
 * Lists bills via the paginated GET /sales/bills, opens a detail drawer with
 * lines/payments/refunds, and lets a manager refund (partial/full) a paid bill
 * with an approval PIN. Cancel stays on the POS (it needs the opening device +
 * an OPEN shift); admin here is view + refund.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatVnd } from "@ilikebuffet/shared";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { usePagedList } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  Select,
  InlineError,
  DetailDrawer,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination, Badge } from "./_shared/table";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";

const PAGE_SIZE = 20;

interface RefundRow {
  id: string;
  amountVnd: number;
  method: string;
  reason: string;
  createdAt: string;
}
interface BillLineRow {
  id: string;
  ticketTypeName: string;
  qty: number;
  unitPriceVnd: number;
  lineTotalVnd: number;
}
interface PaymentRow {
  id: string;
  method: string;
  amountVnd: number;
  tenderedVnd: number | null;
  changeVnd: number | null;
}
interface BillListRow {
  id: string;
  number: string;
  branchId: string;
  businessDate: string;
  createdAt: string;
  guestCount: number;
  totalVnd: number;
  status: "COMPLETED" | "CANCELLED";
  paidAt: string | null;
  quarantined: boolean;
  refunds: { amountVnd: number }[];
}
interface BillDetail extends BillListRow {
  lines: BillLineRow[];
  payments: PaymentRow[];
  refunds: RefundRow[];
}

const vnDate = (iso: string) => iso.slice(0, 10);
const vnTime = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

export const OrdersPage: React.FC = () => {
  const [filters, setFilters] = React.useState({ from: "", to: "", status: "", q: "" });
  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const { rows, total, isLoading, isError, error } = usePagedList<BillListRow>({
    queryKey: QUERY_KEYS.orders(),
    path: "/sales/bills",
    page,
    pageSize: PAGE_SIZE,
    filters,
  });

  const patch = (p: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
  };

  const columns = React.useMemo<ColumnDef<BillListRow>[]>(
    () => [
      {
        id: "number",
        enableSorting: false,
        meta: { headerLabel: "Số bill" },
        header: "Số bill",
        cell: ({ row }) => row.original.number,
      },
      {
        id: "date",
        enableSorting: false,
        meta: { headerLabel: "Ngày" },
        header: "Ngày",
        cell: ({ row }) => `${vnDate(row.original.businessDate)} ${vnTime(row.original.createdAt)}`,
      },
      {
        id: "guests",
        enableSorting: false,
        meta: { headerLabel: "Khách", align: "right" },
        header: "Khách",
        cell: ({ row }) => row.original.guestCount,
      },
      {
        id: "total",
        enableSorting: false,
        meta: { headerLabel: "Tổng", align: "right" },
        header: "Tổng",
        cell: ({ row }) => formatVnd(row.original.totalVnd),
      },
      {
        id: "status",
        enableSorting: false,
        meta: { headerLabel: "Trạng thái" },
        header: "Trạng thái",
        cell: ({ row }) => (
          <Badge tone={row.original.status === "CANCELLED" ? "warn" : "success"}>
            {row.original.status === "CANCELLED" ? "Đã huỷ" : "Hoàn tất"}
          </Badge>
        ),
      },
      {
        id: "flags",
        enableSorting: false,
        meta: { headerLabel: "" },
        header: "",
        cell: ({ row }) =>
          row.original.quarantined ? (
            <Badge tone="warn">Cách ly</Badge>
          ) : row.original.refunds.length > 0 ? (
            <Badge tone="neutral">Đã hoàn</Badge>
          ) : null,
      },
    ],
    [],
  );

  const table = useDataTable<BillListRow>({
    data: rows,
    columns,
    total,
    page,
    limit: PAGE_SIZE,
    sort: null,
    setPage,
    setLimit: () => {},
    setSort: () => {},
    getRowId: (b) => b.id,
  });

  return (
    <>
      <ListPageShell
        activePath="/orders"
        pageTitle="Đơn hàng"
        toolbar={
          <PageToolbar
            left={
              <PageTabs
                value="list"
                onChange={() => {}}
                items={[{ value: "list", label: "Danh sách", count: rows.length }]}
              />
            }
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Từ ngày
              <input type="date" aria-label="Từ ngày" value={filters.from} onChange={(e) => patch({ from: e.target.value })} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Đến ngày
              <input type="date" aria-label="Đến ngày" value={filters.to} onChange={(e) => patch({ to: e.target.value })} />
            </label>
            <Select aria-label="Trạng thái" value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
              <option value="">Tất cả trạng thái</option>
              <option value="COMPLETED">Hoàn tất</option>
              <option value="CANCELLED">Đã huỷ</option>
            </Select>
            <input
              type="search"
              aria-label="Tìm số bill"
              placeholder="Tìm số bill…"
              value={filters.q}
              onChange={(e) => patch({ q: e.target.value })}
              style={{
                height: "var(--input-height, 44px)",
                padding: "0 var(--space-3)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
              }}
            />
          </PageToolbar>
        }
        pagination={
          !isLoading && !isError
            ? <DataTablePagination table={table} total={total} />
            : undefined
        }
      >
        {isLoading ? (
          <div style={{ padding: "var(--space-5)" }}>
            <LoadingState />
          </div>
        ) : isError ? (
          <div style={{ padding: "var(--space-5)" }}>
            <ErrorState message={toErrorMessage(error, "Không tải được danh sách bill")} />
          </div>
        ) : (
          <DataTable
            table={table}
            onRowClick={(b) => setSelectedId(b.id)}
            empty="Không có bill khớp bộ lọc."
          />
        )}
      </ListPageShell>

      <OrderDetailDrawer billId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
};

// ── Detail drawer + refund ─────────────────────────────────────────────────────

const OrderDetailDrawer: React.FC<{ billId: string | null; onClose: () => void }> = ({ billId, onClose }) => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [managerId, setManagerId] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [method, setMethod] = React.useState("CASH");
  const [formError, setFormError] = React.useState<string | null>(null);

  const detail = useQuery({
    queryKey: billId ? QUERY_KEYS.order(billId) : ["order", "none"],
    enabled: !!billId,
    queryFn: () => api.get<BillDetail>(`/sales/bills/${billId}`),
  });

  React.useEffect(() => {
    // Reset the refund form whenever a different bill opens.
    setAmount("");
    setReason("");
    setManagerId("");
    setPin("");
    setMethod("CASH");
    setFormError(null);
  }, [billId]);

  const bill = detail.data;
  const refundedVnd = bill ? bill.refunds.reduce((s, r) => s + r.amountVnd, 0) : 0;
  const remaining = bill ? bill.totalVnd - refundedVnd : 0;
  const canRefund = !!bill && bill.status === "COMPLETED" && !!bill.paidAt && remaining > 0;

  const refundMutation = useMutation({
    mutationFn: () =>
      api.post(`/sales/bills/${billId}/refund`, {
        amountVnd: Number.parseInt(amount, 10),
        method,
        reason,
        managerId,
        pin,
      }),
    onSuccess: () => {
      if (billId) void qc.invalidateQueries({ queryKey: QUERY_KEYS.order(billId) });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.orders() });
      setAmount("");
      setReason("");
      setPin("");
      setFormError(null);
    },
    onError: (e) => setFormError(toErrorMessage(e, "Hoàn tiền thất bại")),
  });

  const submitRefund = () => {
    const amt = Number.parseInt(amount, 10);
    if (!Number.isInteger(amt) || amt <= 0) return setFormError("Số tiền hoàn không hợp lệ");
    if (amt > remaining) return setFormError("Vượt quá số tiền còn có thể hoàn");
    if (!reason.trim() || !managerId.trim() || !pin.trim()) return setFormError("Nhập đủ lý do, quản lý và PIN");
    setFormError(null);
    refundMutation.mutate();
  };

  return (
    <DetailDrawer open={!!billId} title={bill ? `Bill ${bill.number}` : "Chi tiết bill"} onClose={onClose}>
      {detail.isLoading || !bill ? (
        <LoadingState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
          <section>
            <Row label="Ngày" value={`${vnDate(bill.businessDate)} ${vnTime(bill.createdAt)}`} />
            <Row label="Khách" value={String(bill.guestCount)} />
            <Row label="Tổng" value={formatVnd(bill.totalVnd)} />
            <Row label="Đã hoàn" value={formatVnd(refundedVnd)} />
            <Row label="Còn lại" value={formatVnd(remaining)} />
            <Row label="Trạng thái" value={bill.status === "CANCELLED" ? "Đã huỷ" : "Hoàn tất"} />
          </section>

          <Section title="Dòng vé">
            {bill.lines.map((l) => (
              <Row key={l.id} label={`${l.ticketTypeName} ×${l.qty}`} value={formatVnd(l.lineTotalVnd)} />
            ))}
          </Section>

          {bill.payments.length > 0 && (
            <Section title="Thanh toán">
              {bill.payments.map((p) => (
                <Row key={p.id} label={p.method} value={formatVnd(p.amountVnd) + (p.changeVnd ? ` (thối ${formatVnd(p.changeVnd)})` : "")} />
              ))}
            </Section>
          )}

          {bill.refunds.length > 0 && (
            <Section title="Đã hoàn tiền">
              {bill.refunds.map((r) => (
                <Row key={r.id} label={`${r.method} · ${r.reason}`} value={formatVnd(r.amountVnd)} />
              ))}
            </Section>
          )}

          {canRefund && (
            <Section title="Hoàn tiền">
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <input aria-label="Số tiền hoàn" type="number" placeholder={`Số tiền (≤ ${remaining})`} value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
                <Select aria-label="Phương thức hoàn" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="CASH">Tiền mặt</option>
                  <option value="VIETQR">VietQR</option>
                  <option value="CARD">Thẻ</option>
                </Select>
                <input aria-label="Lý do" placeholder="Lý do hoàn" value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} />
                <input aria-label="Mã quản lý" placeholder="ID quản lý duyệt" value={managerId} onChange={(e) => setManagerId(e.target.value)} style={inputStyle} />
                <input aria-label="PIN quản lý" type="password" placeholder="PIN quản lý" value={pin} onChange={(e) => setPin(e.target.value)} style={inputStyle} />
                <InlineError message={formError} />
                <Button variant="action" onClick={submitRefund} disabled={refundMutation.isPending}>
                  {refundMutation.isPending ? "Đang hoàn…" : "Xác nhận hoàn tiền"}
                </Button>
              </div>
            </Section>
          )}
        </div>
      )}
    </DetailDrawer>
  );
};

const inputStyle: React.CSSProperties = {
  height: "var(--input-height, 44px)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", padding: "2px 0" }}>
    <span style={{ color: "var(--text-muted)" }}>{label}</span>
    <span style={{ color: "var(--text-primary)" }}>{value}</span>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
    <h3 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--text-muted)" }}>
      {title}
    </h3>
    {children}
  </section>
);
