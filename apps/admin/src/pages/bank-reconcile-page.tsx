/**
 * BankReconcilePage — VietQR bank-transfer reconciliation (M8/V2).
 *
 * Chain-level accounting screen. Lists Sepay transfers with their match status;
 * for an UNMATCHED transfer the reconciler can attach it to a bill by number
 * (auto-confirms the VIETQR payment) or ignore it with a note. Auto-matched
 * transfers already carry their bill number.
 */
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatVnd } from "@ilikebuffet/shared";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { usePagedList } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  Card,
  PageStack,
  DataTable,
  Column,
  FilterBar,
  Pagination,
  DetailDrawer,
  Select,
  InlineError,
  Badge,
  BadgeTone,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";

const PAGE_SIZE = 20;

interface BankTxRow {
  id: string;
  gateway: string | null;
  amountVnd: number;
  content: string;
  referenceCode: string | null;
  transferredAt: string;
  status: "UNMATCHED" | "MATCHED" | "IGNORED";
  matchedBillId: string | null;
  matchedBillNumber: string | null;
  note: string | null;
}

const STATUS_LABEL: Record<BankTxRow["status"], string> = { UNMATCHED: "Chờ đối soát", MATCHED: "Đã khớp", IGNORED: "Bỏ qua" };
const STATUS_TONE: Record<BankTxRow["status"], BadgeTone> = { UNMATCHED: "warn", MATCHED: "active", IGNORED: "muted" };
const vnDateTime = (iso: string) => `${iso.slice(0, 10)} ${new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;

export const BankReconcilePage: React.FC = () => {
  const [filters, setFilters] = React.useState({ status: "" });
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<BankTxRow | null>(null);

  const { rows, total, pageCount, isLoading, isError, error } = usePagedList<BankTxRow>({
    queryKey: QUERY_KEYS.bankTransactions(),
    path: "/sales/bank-transactions",
    page,
    pageSize: PAGE_SIZE,
    filters,
  });

  const patch = (p: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
  };

  const columns: Column<BankTxRow>[] = [
    { key: "date", header: "Thời gian", render: (t) => vnDateTime(t.transferredAt) },
    { key: "gateway", header: "Ngân hàng", render: (t) => t.gateway ?? "—" },
    { key: "amount", header: "Số tiền", align: "right", render: (t) => formatVnd(t.amountVnd) },
    { key: "content", header: "Nội dung", render: (t) => t.content },
    { key: "bill", header: "Bill", render: (t) => t.matchedBillNumber ?? "—" },
    { key: "status", header: "Trạng thái", render: (t) => <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge> },
  ];

  return (
    <PageStack>
      <Card title="Đối soát ngân hàng" description="Giao dịch chuyển khoản VietQR (Sepay). Giao dịch chờ đối soát có thể khớp bill thủ công hoặc bỏ qua.">
        <FilterBar>
          <Select aria-label="Trạng thái" value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
            <option value="">Tất cả trạng thái</option>
            <option value="UNMATCHED">Chờ đối soát</option>
            <option value="MATCHED">Đã khớp</option>
            <option value="IGNORED">Bỏ qua</option>
          </Select>
        </FilterBar>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được giao dịch")} />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(t) => t.id} onRowClick={(t) => setSelected(t)} emptyText="Chưa có giao dịch." />
            <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <ReconcileDrawer tx={selected} onClose={() => setSelected(null)} />
    </PageStack>
  );
};

const ReconcileDrawer: React.FC<{ tx: BankTxRow | null; onClose: () => void }> = ({ tx, onClose }) => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [billNumber, setBillNumber] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setBillNumber("");
    setNote("");
    setError(null);
  }, [tx?.id]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: QUERY_KEYS.bankTransactions() });

  const match = useMutation({
    mutationFn: () => api.post(`/sales/bank-transactions/${tx!.id}/match`, { billNumber: billNumber.trim() }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e, "Khớp bill thất bại")),
  });
  const ignore = useMutation({
    mutationFn: () => api.post(`/sales/bank-transactions/${tx!.id}/ignore`, { note: note.trim() || undefined }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e, "Bỏ qua thất bại")),
  });

  return (
    <DetailDrawer open={!!tx} title={tx ? "Giao dịch chuyển khoản" : ""} onClose={onClose}>
      {!tx ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
          <section>
            <Row label="Thời gian" value={vnDateTime(tx.transferredAt)} />
            <Row label="Ngân hàng" value={tx.gateway ?? "—"} />
            <Row label="Số tiền" value={formatVnd(tx.amountVnd)} />
            <Row label="Nội dung" value={tx.content} />
            {tx.referenceCode && <Row label="Mã tham chiếu" value={tx.referenceCode} />}
            <Row label="Trạng thái" value={STATUS_LABEL[tx.status]} />
            {tx.matchedBillNumber && <Row label="Bill đã khớp" value={tx.matchedBillNumber} />}
            {tx.note && <Row label="Ghi chú" value={tx.note} />}
          </section>

          {tx.status === "UNMATCHED" && (
            <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <label style={labelStyle}>
                Khớp với bill (số bill)
                <input aria-label="Số bill" placeholder="VD CN01-260803-0001" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} style={inputStyle} />
              </label>
              <Button variant="action" disabled={!billNumber.trim() || match.isPending} onClick={() => match.mutate()}>
                {match.isPending ? "Đang khớp…" : "Khớp bill"}
              </Button>

              <label style={labelStyle}>
                Hoặc bỏ qua (lý do)
                <input aria-label="Lý do bỏ qua" placeholder="Lý do" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
              </label>
              <Button variant="ghost" disabled={ignore.isPending} onClick={() => ignore.mutate()}>
                {ignore.isPending ? "Đang bỏ qua…" : "Bỏ qua giao dịch"}
              </Button>
              <InlineError message={error} />
            </section>
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
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" };

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", padding: "2px 0" }}>
    <span style={{ color: "var(--text-muted)" }}>{label}</span>
    <span style={{ color: "var(--text-primary)", textAlign: "right" }}>{value}</span>
  </div>
);
