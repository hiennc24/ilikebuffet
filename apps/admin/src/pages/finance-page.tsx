/**
 * FinancePage — income/expense (thu-chi) entries (E3/F1).
 *
 * Lists entries with income/expense/net KPIs, filters by flow/account/period, and
 * records a new entry against a chart-of-accounts account. When the amount exceeds
 * the account's approval threshold, manager id + PIN fields appear (server is the
 * gate). Backend gates by capability (cash:read / cash:create-voucher).
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatVnd } from "@ilikebuffet/shared";
import { Button, Dialog } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { usePagedList, buildQuery } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import { Card, PageStack, DataTable, Column, FilterBar, Pagination, Select, InlineError, Badge, LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";
import { KpiCard, KpiRow } from "./_shared/report-ui";

const PAGE_SIZE = 20;
const today = () => new Date().toISOString().slice(0, 10);

interface Account {
  id: string;
  name: string;
  flow: "INCOME" | "EXPENSE";
  approvalThresholdVnd: number;
}
interface FinanceRow {
  id: string;
  code: string;
  accountId: string;
  accountName: string;
  flow: "INCOME" | "EXPENSE";
  amountVnd: number;
  method: string;
  occurredAt: string;
  note: string | null;
  approvedBy: string | null;
}
interface FinanceSummary {
  totals: { incomeVnd: number; expenseVnd: number; netVnd: number };
}

const vnDate = (iso: string) => iso.slice(0, 10);

export const FinancePage: React.FC = () => {
  const { api } = useAuth();
  const [filters, setFilters] = React.useState({ flow: "", accountId: "", from: "", to: "" });
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);

  const accountsQuery = useQuery({ queryKey: QUERY_KEYS.accounts(), queryFn: () => api.get<Account[] | { data: Account[] }>("/master-data/accounts") });
  const accounts = unwrapList(accountsQuery.data);

  const { rows, total, pageCount, isLoading, isError, error } = usePagedList<FinanceRow>({
    queryKey: QUERY_KEYS.finance(),
    path: "/sales/finance",
    page,
    pageSize: PAGE_SIZE,
    filters,
  });

  const summary = useQuery({
    queryKey: [...QUERY_KEYS.financeSummary(), filters],
    queryFn: () => api.get<FinanceSummary>(`/sales/finance/summary?${buildQuery({ from: filters.from, to: filters.to })}`),
  });

  const patch = (p: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
  };

  const columns: Column<FinanceRow>[] = [
    { key: "date", header: "Ngày", render: (r) => vnDate(r.occurredAt) },
    { key: "code", header: "Mã phiếu", render: (r) => r.code },
    { key: "account", header: "Tài khoản", render: (r) => r.accountName },
    { key: "flow", header: "Loại", render: (r) => <Badge tone={r.flow === "INCOME" ? "active" : "warn"}>{r.flow === "INCOME" ? "Thu" : "Chi"}</Badge> },
    { key: "amount", header: "Số tiền", align: "right", render: (r) => formatVnd(r.amountVnd) },
    { key: "method", header: "Phương thức", render: (r) => r.method },
  ];

  return (
    <PageStack>
      {summary.data && (
        <KpiRow>
          <KpiCard label="Tổng thu" value={formatVnd(summary.data.totals.incomeVnd)} />
          <KpiCard label="Tổng chi" value={formatVnd(summary.data.totals.expenseVnd)} tone={summary.data.totals.expenseVnd > 0 ? "warn" : "default"} />
          <KpiCard label="Ròng" value={formatVnd(summary.data.totals.netVnd)} tone={summary.data.totals.netVnd < 0 ? "warn" : "default"} />
        </KpiRow>
      )}

      <Card
        title="Thu - Chi"
        description="Phiếu thu-chi theo tài khoản kế toán. Vượt ngưỡng cần quản lý duyệt PIN."
        actions={<Button variant="action" onClick={() => setCreating(true)}>Phiếu mới</Button>}
      >
        <FilterBar>
          <Select aria-label="Loại" value={filters.flow} onChange={(e) => patch({ flow: e.target.value })}>
            <option value="">Tất cả thu/chi</option>
            <option value="INCOME">Thu</option>
            <option value="EXPENSE">Chi</option>
          </Select>
          <Select aria-label="Tài khoản" value={filters.accountId} onChange={(e) => patch({ accountId: e.target.value })}>
            <option value="">Tất cả tài khoản</option>
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </Select>
          <input type="date" aria-label="Từ ngày" value={filters.from} onChange={(e) => patch({ from: e.target.value })} style={inputStyle} />
          <input type="date" aria-label="Đến ngày" value={filters.to} onChange={(e) => patch({ to: e.target.value })} style={inputStyle} />
        </FilterBar>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được phiếu thu-chi")} />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyText="Chưa có phiếu." />
            <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      {creating && <FinanceDialog accounts={accounts} onClose={() => setCreating(false)} />}
    </PageStack>
  );
};

const FinanceDialog: React.FC<{ accounts: Account[]; onClose: () => void }> = ({ accounts, onClose }) => {
  const { api, selectedBranchId } = useAuth();
  const qc = useQueryClient();
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState("CASH");
  const [occurredAt, setOccurredAt] = React.useState(today());
  const [note, setNote] = React.useState("");
  const [managerId, setManagerId] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const account = accounts.find((a) => a.id === accountId);
  const amountNum = Number.parseInt(amount, 10);
  const needsApproval = !!account && account.approvalThresholdVnd > 0 && amountNum > account.approvalThresholdVnd;

  const save = useMutation({
    mutationFn: () =>
      api.post("/sales/finance", {
        branchId: selectedBranchId,
        accountId,
        amountVnd: amountNum,
        method,
        occurredAt,
        note: note.trim() || undefined,
        ...(needsApproval ? { managerId: managerId.trim(), pin: pin.trim() } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.finance() });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.financeSummary() });
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e, "Tạo phiếu thất bại")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) return setError("Chưa chọn chi nhánh");
    if (!accountId) return setError("Chọn tài khoản");
    if (!Number.isInteger(amountNum) || amountNum <= 0) return setError("Số tiền phải là số nguyên dương");
    if (needsApproval && (!managerId.trim() || !pin.trim())) return setError("Phiếu vượt ngưỡng — nhập quản lý + PIN");
    setError(null);
    save.mutate();
  };

  return (
    <Dialog open title="Phiếu thu-chi mới" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <label style={labelStyle}>
          Tài khoản *
          <Select aria-label="Tài khoản phiếu" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">— Chọn —</option>
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name} ({a.flow === "INCOME" ? "Thu" : "Chi"})</option>))}
          </Select>
        </label>
        <label style={labelStyle}>
          Số tiền *
          <input aria-label="Số tiền" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Phương thức
          <Select aria-label="Phương thức" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">Tiền mặt</option>
            <option value="VIETQR">VietQR</option>
            <option value="CARD">Thẻ</option>
          </Select>
        </label>
        <label style={labelStyle}>
          Ngày
          <input aria-label="Ngày" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Ghi chú
          <input aria-label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
        </label>

        {needsApproval && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", padding: "var(--space-3)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Vượt ngưỡng {formatVnd(account!.approvalThresholdVnd)} — cần quản lý duyệt.</span>
            <input aria-label="ID quản lý" placeholder="ID quản lý duyệt" value={managerId} onChange={(e) => setManagerId(e.target.value)} style={inputStyle} />
            <input aria-label="PIN quản lý" type="password" placeholder="PIN quản lý" value={pin} onChange={(e) => setPin(e.target.value)} style={inputStyle} />
          </div>
        )}

        <InlineError message={error} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button type="button" variant="ghost" onClick={onClose}>Đóng</Button>
          <Button type="submit" variant="action" disabled={save.isPending}>{save.isPending ? "Đang lưu…" : "Tạo phiếu"}</Button>
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
