/**
 * SupplierDebtPage — supplier payables (công nợ NCC) (E3/F2).
 *
 * Payables open automatically when goods are received against a PO. This screen
 * lists them with outstanding + overdue, and lets a user record a payment (books
 * an EXPENSE entry, marks PAID when settled). Backend gates by capability.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatVnd } from "@ilikebuffet/shared";
import { Button, Dialog } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { usePagedList } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  Select,
  InlineError,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination, Badge } from "./_shared/table";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";

const PAGE_SIZE = 20;

interface Account {
  id: string;
  name: string;
  flow: "INCOME" | "EXPENSE";
  approvalThresholdVnd: number;
}
interface PayableRow {
  id: string;
  supplierName: string;
  amountVnd: number;
  paidVnd: number;
  outstandingVnd: number;
  status: "OPEN" | "PAID";
  dueDate: string | null;
  overdue: boolean;
}

const vnDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export const SupplierDebtPage: React.FC = () => {
  const { api } = useAuth();
  const [filters, setFilters] = React.useState({ status: "" });
  const [page, setPage] = React.useState(1);
  const [paying, setPaying] = React.useState<PayableRow | null>(null);

  const accountsQuery = useQuery({ queryKey: QUERY_KEYS.accounts(), queryFn: () => api.get<Account[] | { data: Account[] }>("/master-data/accounts") });
  const expenseAccounts = unwrapList(accountsQuery.data).filter((a) => a.flow === "EXPENSE");

  const { rows, total, isLoading, isError, error } = usePagedList<PayableRow>({
    queryKey: QUERY_KEYS.payables(),
    path: "/sales/finance/payables",
    page,
    pageSize: PAGE_SIZE,
    filters,
  });

  const patch = (p: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
  };

  const columns = React.useMemo<ColumnDef<PayableRow>[]>(
    () => [
      {
        id: "supplier",
        enableSorting: false,
        meta: { headerLabel: "Nhà cung cấp" },
        header: "Nhà cung cấp",
        cell: ({ row }) => row.original.supplierName,
      },
      {
        id: "amount",
        enableSorting: false,
        meta: { headerLabel: "Tổng nợ", align: "right" },
        header: "Tổng nợ",
        cell: ({ row }) => formatVnd(row.original.amountVnd),
      },
      {
        id: "paid",
        enableSorting: false,
        meta: { headerLabel: "Đã trả", align: "right" },
        header: "Đã trả",
        cell: ({ row }) => formatVnd(row.original.paidVnd),
      },
      {
        id: "out",
        enableSorting: false,
        meta: { headerLabel: "Còn nợ", align: "right" },
        header: "Còn nợ",
        cell: ({ row }) => formatVnd(row.original.outstandingVnd),
      },
      {
        id: "due",
        enableSorting: false,
        meta: { headerLabel: "Hạn" },
        header: "Hạn",
        cell: ({ row }) => {
          const r = row.original;
          return r.overdue ? <Badge tone="warn">{vnDate(r.dueDate)}</Badge> : vnDate(r.dueDate);
        },
      },
      {
        id: "status",
        enableSorting: false,
        meta: { headerLabel: "Trạng thái" },
        header: "Trạng thái",
        cell: ({ row }) => {
          const r = row.original;
          return (
            <Badge tone={r.status === "PAID" ? "success" : "neutral"}>
              {r.status === "PAID" ? "Đã trả" : "Còn nợ"}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  const table = useDataTable<PayableRow>({
    data: rows,
    columns,
    total: rows.length,
    page: 1,
    limit: rows.length || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (r) => r.id,
  });

  return (
    <>
      <ListPageShell
        activePath="/finance/payables"
        pageTitle="Công nợ nhà cung cấp"
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
            <Select aria-label="Trạng thái" value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
              <option value="">Tất cả</option>
              <option value="OPEN">Còn nợ</option>
              <option value="PAID">Đã trả</option>
            </Select>
          </PageToolbar>
        }
        pagination={
          !isLoading && !isError
            ? <DataTablePagination table={table} total={total} />
            : undefined
        }
      >
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được công nợ")} />
        ) : (
          <DataTable
            table={table}
            onRowClick={(r) => r.status === "OPEN" && setPaying(r)}
            empty="Chưa có công nợ."
          />
        )}
      </ListPageShell>

      {paying && <PayDialog payable={paying} accounts={expenseAccounts} onClose={() => setPaying(null)} />}
    </>
  );
};

const PayDialog: React.FC<{ payable: PayableRow; accounts: Account[]; onClose: () => void }> = ({ payable, accounts, onClose }) => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = React.useState(String(payable.outstandingVnd));
  const [method, setMethod] = React.useState("CASH");
  const [managerId, setManagerId] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const account = accounts.find((a) => a.id === accountId);
  const amountNum = Number.parseInt(amount, 10);
  const needsApproval = !!account && account.approvalThresholdVnd > 0 && amountNum > account.approvalThresholdVnd;

  const pay = useMutation({
    mutationFn: () =>
      api.post(`/sales/finance/payables/${payable.id}/pay`, {
        accountId,
        amountVnd: amountNum,
        method,
        ...(needsApproval ? { managerId: managerId.trim(), pin: pin.trim() } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.payables() });
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e, "Thanh toán thất bại")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return setError("Chọn tài khoản chi");
    if (!Number.isInteger(amountNum) || amountNum <= 0) return setError("Số tiền không hợp lệ");
    if (amountNum > payable.outstandingVnd) return setError("Vượt quá số còn nợ");
    if (needsApproval && (!managerId.trim() || !pin.trim())) return setError("Vượt ngưỡng — nhập quản lý + PIN");
    setError(null);
    pay.mutate();
  };

  return (
    <Dialog open title={`Thanh toán — ${payable.supplierName}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Còn nợ: {formatVnd(payable.outstandingVnd)}</p>
        <label style={labelStyle}>
          Tài khoản chi
          <Select aria-label="Tài khoản chi" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">— Chọn —</option>
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </Select>
        </label>
        <label style={labelStyle}>
          Số tiền
          <input aria-label="Số tiền trả" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Phương thức
          <Select aria-label="Phương thức trả" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">Tiền mặt</option>
            <option value="VIETQR">VietQR</option>
            <option value="CARD">Thẻ</option>
          </Select>
        </label>
        {needsApproval && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <input aria-label="ID quản lý" placeholder="ID quản lý duyệt" value={managerId} onChange={(e) => setManagerId(e.target.value)} style={inputStyle} />
            <input aria-label="PIN quản lý" type="password" placeholder="PIN quản lý" value={pin} onChange={(e) => setPin(e.target.value)} style={inputStyle} />
          </div>
        )}
        <InlineError message={error} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button type="button" variant="ghost" onClick={onClose}>Đóng</Button>
          <Button type="submit" variant="action" disabled={pay.isPending}>{pay.isPending ? "Đang lưu…" : "Thanh toán"}</Button>
        </div>
      </form>
    </Dialog>
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
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" };
