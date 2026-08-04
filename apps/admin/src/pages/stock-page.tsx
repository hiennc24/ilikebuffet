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
import type { ColumnDef } from "@tanstack/react-table";
import { formatVnd } from "@ilikebuffet/shared";
import { Button, Dialog } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { usePagedList } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  Card,
  PageStack,
  FilterBar,
  DetailDrawer,
  InlineError,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination, Badge } from "./_shared/table";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";
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

  const { rows, total, isLoading, isError, error } = usePagedList<StockRow>({
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

  const columns = React.useMemo<ColumnDef<StockRow>[]>(
    () => [
      {
        id: "name",
        enableSorting: false,
        meta: { headerLabel: "Nguyên liệu" },
        header: "Nguyên liệu",
        cell: ({ row }) => row.original.ingredientName,
      },
      {
        id: "qty",
        enableSorting: false,
        meta: { headerLabel: "Tồn", align: "right" as const },
        header: "Tồn",
        cell: ({ row }) => `${fmtQty(row.original.qtyBase)} ${row.original.unitCode}`,
      },
      {
        id: "avg",
        enableSorting: false,
        meta: { headerLabel: "Giá vốn TB", align: "right" as const },
        header: "Giá vốn TB",
        cell: ({ row }) => formatVnd(row.original.avgCostVnd),
      },
      {
        id: "value",
        enableSorting: false,
        meta: { headerLabel: "Giá trị", align: "right" as const },
        header: "Giá trị",
        cell: ({ row }) => formatVnd(row.original.valueVnd),
      },
      {
        id: "low",
        enableSorting: false,
        meta: { headerLabel: "", width: "100px" },
        header: "",
        cell: ({ row }) =>
          row.original.lowStock ? <Badge tone="warn">Tồn thấp</Badge> : null,
      },
    ],
    [],
  );

  const table = useDataTable<StockRow>({
    data: rows,
    columns,
    total,
    page,
    limit: PAGE_SIZE,
    sort: null,
    setPage,
    setLimit: () => {},
    setSort: () => {},
    getRowId: (r) => r.ingredientId,
  });

  return (
    <>
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

        <ListPageShell
          activePath="/inventory/stock"
          pageTitle="Tồn kho"
          toolbar={
            <PageToolbar
              left={
                <PageTabs
                  value="list"
                  onChange={() => {}}
                  items={[{ value: "list", label: "Danh sách", count: total }]}
                />
              }
            >
              <input
                type="search"
                aria-label="Tìm nguyên liệu"
                placeholder="Tìm mã/tên…"
                value={filters.q}
                onChange={(e) => patch({ q: e.target.value })}
                style={inputStyle}
              />
              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  aria-label="Chỉ tồn thấp"
                  checked={filters.lowOnly === "true"}
                  onChange={(e) => patch({ lowOnly: e.target.checked ? "true" : "" })}
                />
                Chỉ tồn thấp
              </label>
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
              <ErrorState message={toErrorMessage(error, "Không tải được tồn kho")} />
            </div>
          ) : (
            <DataTable
              table={table}
              onRowClick={(r) => setSelected(r)}
              empty="Chưa có tồn kho."
            />
          )}
        </ListPageShell>

        <ConsumptionCard />
      </PageStack>

      <StockDrawer row={selected} onClose={() => setSelected(null)} />
    </>
  );
};

// ── Consumption / COGS (period) ─────────────────────────────────────────────

interface Consumption {
  totalCogsVnd: number;
  byIngredient: { ingredientId: string; name: string; unitCode: string; consumedQtyBase: number; cogsVnd: number }[];
}

const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const today = () => new Date().toISOString().slice(0, 10);

const ConsumptionCard: React.FC = () => {
  const { api } = useAuth();
  const [from, setFrom] = React.useState(monthStart);
  const [to, setTo] = React.useState(today);

  const q = useQuery({
    queryKey: ["inventory-consumption", from, to],
    queryFn: () => api.get<Consumption>(`/inventory/reports/consumption?from=${from}&to=${to}`),
  });

  return (
    <Card title="Tiêu hao & giá vốn (kỳ)" description="Giá vốn hàng bán ước tính theo định mức, đã trừ bill đã huỷ.">
      <FilterBar>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          Từ ngày
          <input type="date" aria-label="Từ ngày" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          Đến ngày
          <input type="date" aria-label="Đến ngày" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </FilterBar>

      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={toErrorMessage(q.error, "Không tải được tiêu hao")} />
      ) : (
        <>
          <KpiRow>
            <KpiCard label="Giá vốn tiêu hao" value={formatVnd(q.data?.totalCogsVnd ?? 0)} />
          </KpiRow>
          <div style={{ marginTop: "var(--space-3)" }}>
            {(q.data?.byIngredient ?? []).slice(0, 10).map((r) => (
              <Row key={r.ingredientId} label={`${r.name} · ${fmtQty(r.consumedQtyBase)} ${r.unitCode}`} value={formatVnd(r.cogsVnd)} />
            ))}
            {(q.data?.byIngredient.length ?? 0) === 0 && (
              <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>Chưa có tiêu hao trong kỳ.</span>
            )}
          </div>
        </>
      )}
    </Card>
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
