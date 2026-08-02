/**
 * StockPage — on-hand balances, movement history, and manual issue/adjust (W3).
 *
 * Branch-scoped by the backend. Lists balances via GET /inventory/stock with a
 * search + low-stock filter, opens a drawer with movement history, and lets
 * warehouse staff issue (wastage) or adjust (stock-take) a stock line with a
 * required reason. On-hand can never go negative (server-enforced).
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatVnd } from "@ilikebuffet/shared";
import { Button, Dialog } from "@ilikebuffet/ui";
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
  InlineError,
  Badge,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import { KpiCard, KpiRow } from "./_shared/report-ui";

const PAGE_SIZE = 20;

interface StockRow {
  branchId: string;
  ingredientId: string;
  ingredientName: string;
  ingredientCode: string | null;
  unitCode: string;
  qtyBase: number;
  avgCostVnd: number;
  valueVnd: number;
  minStock: number;
  lowStock: boolean;
}
interface MovementRow {
  id: string;
  ingredientName: string;
  unitCode: string;
  type: "RECEIPT" | "ISSUE" | "ADJUST";
  qtyBase: number;
  unitCostVnd: number | null;
  note: string | null;
  refType: string | null;
  createdAt: string;
}

const MOVE_LABEL: Record<MovementRow["type"], string> = { RECEIPT: "Nhập", ISSUE: "Xuất", ADJUST: "Điều chỉnh" };
const vnDateTime = (iso: string) => `${iso.slice(0, 10)} ${new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
const fmtQty = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });

interface Valuation {
  totalValueVnd: number;
  itemCount: number;
  lowStockCount: number;
}

export const StockPage: React.FC = () => {
  const { api } = useAuth();
  const [filters, setFilters] = React.useState({ q: "", lowOnly: "" });
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<StockRow | null>(null);

  const valuation = useQuery({
    queryKey: ["inventory-valuation"],
    queryFn: () => api.get<Valuation>("/inventory/reports/valuation"),
  });

  const { rows, total, pageCount, isLoading, isError, error } = usePagedList<StockRow>({
    queryKey: QUERY_KEYS.stock(),
    path: "/inventory/stock",
    page,
    pageSize: PAGE_SIZE,
    filters,
  });

  const patch = (p: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
  };

  const columns: Column<StockRow>[] = [
    { key: "name", header: "Nguyên liệu", render: (r) => r.ingredientName },
    { key: "qty", header: "Tồn", align: "right", render: (r) => `${fmtQty(r.qtyBase)} ${r.unitCode}` },
    { key: "avg", header: "Giá vốn TB", align: "right", render: (r) => formatVnd(r.avgCostVnd) },
    { key: "value", header: "Giá trị", align: "right", render: (r) => formatVnd(r.valueVnd) },
    {
      key: "low",
      header: "",
      render: (r) => (r.lowStock ? <Badge tone="warn">Tồn thấp</Badge> : null),
    },
  ];

  return (
    <PageStack>
      {valuation.data && (
        <KpiRow>
          <KpiCard label="Giá trị tồn" value={formatVnd(valuation.data.totalValueVnd)} />
          <KpiCard label="Số mặt hàng" value={String(valuation.data.itemCount)} />
          <KpiCard
            label="Tồn thấp"
            value={String(valuation.data.lowStockCount)}
            tone={valuation.data.lowStockCount > 0 ? "warn" : "default"}
          />
        </KpiRow>
      )}

      <Card title="Tồn kho" description="Tồn hiện tại theo chi nhánh, giá vốn trung bình và cảnh báo tồn thấp.">
        <FilterBar>
          <input type="search" aria-label="Tìm nguyên liệu" placeholder="Tìm mã/tên…" value={filters.q} onChange={(e) => patch({ q: e.target.value })} style={inputStyle} />
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            <input type="checkbox" aria-label="Chỉ tồn thấp" checked={filters.lowOnly === "true"} onChange={(e) => patch({ lowOnly: e.target.checked ? "true" : "" })} />
            Chỉ tồn thấp
          </label>
        </FilterBar>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được tồn kho")} />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.ingredientId} onRowClick={(r) => setSelected(r)} emptyText="Chưa có tồn kho." />
            <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <StockDrawer row={selected} onClose={() => setSelected(null)} />
    </PageStack>
  );
};

// ── Drawer: history + issue/adjust ──────────────────────────────────────────

const StockDrawer: React.FC<{ row: StockRow | null; onClose: () => void }> = ({ row, onClose }) => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [action, setAction] = React.useState<"issue" | "adjust" | null>(null);

  const history = useQuery({
    queryKey: QUERY_KEYS.stockMovements(row?.ingredientId ?? null),
    enabled: !!row,
    queryFn: () =>
      api.get<{ data: MovementRow[] }>(`/inventory/movements?branchId=${row!.branchId}&ingredientId=${row!.ingredientId}`),
  });

  React.useEffect(() => setAction(null), [row?.ingredientId]);

  return (
    <DetailDrawer open={!!row} title={row ? row.ingredientName : "Chi tiết tồn"} onClose={onClose}>
      {!row ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
          <section>
            <Row label="Tồn hiện tại" value={`${fmtQty(row.qtyBase)} ${row.unitCode}`} />
            <Row label="Giá vốn TB" value={formatVnd(row.avgCostVnd)} />
            <Row label="Giá trị tồn" value={formatVnd(row.valueVnd)} />
            <Row label="Định mức tối thiểu" value={`${fmtQty(row.minStock)} ${row.unitCode}`} />
          </section>

          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button variant="action" onClick={() => setAction("issue")}>
              Xuất kho
            </Button>
            <Button variant="ghost" onClick={() => setAction("adjust")}>
              Điều chỉnh
            </Button>
          </div>

          <Section title="Lịch sử chuyển động">
            {history.isLoading ? (
              <LoadingState />
            ) : (history.data?.data.length ?? 0) === 0 ? (
              <span style={{ color: "var(--text-muted)" }}>Chưa có chuyển động.</span>
            ) : (
              history.data!.data.map((m) => (
                <Row key={m.id} label={`${MOVE_LABEL[m.type]} · ${vnDateTime(m.createdAt)}`} value={`${fmtQty(m.qtyBase)} ${m.unitCode}`} />
              ))
            )}
          </Section>

          {action && <StockActionDialog row={row} action={action} onClose={() => setAction(null)} onDone={() => {
            void qc.invalidateQueries({ queryKey: QUERY_KEYS.stock() });
            void qc.invalidateQueries({ queryKey: QUERY_KEYS.stockMovements(row.ingredientId) });
          }} />}
        </div>
      )}
    </DetailDrawer>
  );
};

const StockActionDialog: React.FC<{ row: StockRow; action: "issue" | "adjust"; onClose: () => void; onDone: () => void }> = ({ row, action, onClose, onDone }) => {
  const { api } = useAuth();
  const [qty, setQty] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const isIssue = action === "issue";

  const mutation = useMutation({
    mutationFn: () =>
      isIssue
        ? api.post("/inventory/stock/issue", { branchId: row.branchId, ingredientId: row.ingredientId, qty: Number(qty), note })
        : api.post("/inventory/stock/adjust", { branchId: row.branchId, ingredientId: row.ingredientId, newQty: Number(qty), note }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e, "Thao tác thất bại")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(qty);
    if (isIssue ? !(n > 0) : !(n >= 0)) return setError(isIssue ? "Số lượng xuất phải > 0" : "Số kiểm kê phải ≥ 0");
    if (!note.trim()) return setError("Nhập lý do");
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open title={`${isIssue ? "Xuất kho" : "Điều chỉnh"} — ${row.ingredientName}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <label style={labelStyle}>
          {isIssue ? `Số lượng xuất (${row.unitCode})` : `Số tồn thực tế (${row.unitCode})`}
          <input aria-label={isIssue ? "Số lượng xuất" : "Số tồn thực tế"} type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Lý do *
          <input aria-label="Lý do" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
        </label>
        <InlineError message={error} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button type="submit" variant="action" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang lưu…" : "Xác nhận"}
          </Button>
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
