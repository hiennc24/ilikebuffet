/**
 * GrossMarginReportPage — lãi gộp = doanh thu thuần − giá vốn tiêu hao ước tính,
 * theo ngày/chi nhánh. Read-only; backend branch-scopes and role-gates. COGS is
 * an estimate from ticket recipes (labelled as such).
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatVnd } from "@ilikebuffet/shared";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { useReport } from "../lib/use-report";
import { buildQuery } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import { Select, LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination } from "./_shared/table";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";
import { KpiCard, KpiRow, TotalsBar, type Branch } from "./_shared/report-ui";

const CHAIN_WIDE = new Set(["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI"]);
const today = () => new Date().toISOString().slice(0, 10);

interface MarginRow {
  key: string;
  netRevenueVnd: number;
  cogsVnd: number;
  grossProfitVnd: number;
  marginPct: number;
}
interface MarginReport {
  groupBy: "day" | "branch";
  totals: { netRevenueVnd: number; cogsVnd: number; grossProfitVnd: number; marginPct: number };
  rows: MarginRow[];
}

export const GrossMarginReportPage: React.FC = () => {
  const { api, role } = useAuth();
  const isChainWide = !!role && CHAIN_WIDE.has(role);
  const [filter, setFilter] = React.useState({ from: today(), to: today(), branchId: "" });
  const [groupBy, setGroupBy] = React.useState<"day" | "branch">("day");

  const branchesQuery = useQuery({
    queryKey: QUERY_KEYS.branches(),
    enabled: isChainWide,
    queryFn: () => api.get<Branch[] | { data: Branch[] }>("/branches"),
  });
  const branches = unwrapList(branchesQuery.data);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.code ?? id;

  const { data, isLoading, isError, error } = useReport<MarginReport>({
    queryKey: QUERY_KEYS.grossMarginReport(),
    path: "/sales/reports/gross-margin",
    params: { ...filter, groupBy },
  });

  // Actual per-lot (FIFO) cost of goods for the same window — shown next to the
  // moving-average estimate for comparison.
  const fifo = useQuery({
    queryKey: ["inventory-fifo-cogs", filter.from, filter.to, filter.branchId],
    queryFn: () =>
      api.get<{ totalCogsVnd: number }>(
        `/inventory/reports/fifo-cogs?from=${filter.from}&to=${filter.to}${filter.branchId ? `&branchId=${filter.branchId}` : ""}`,
      ),
  });

  const patch = (p: Partial<typeof filter>) => setFilter((f) => ({ ...f, ...p }));

  const [exporting, setExporting] = React.useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const blob = await api.download(`/sales/reports/gross-margin/export?${buildQuery({ ...filter, groupBy })}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lai-gop-${filter.from}-${filter.to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const keyLabel = (key: string) => (groupBy === "branch" ? branchName(key) : key);

  const rows = data?.rows ?? [];

  const columns = React.useMemo<ColumnDef<MarginRow>[]>(
    () => [
      {
        id: "key",
        enableSorting: false,
        meta: { headerLabel: groupBy === "day" ? "Ngày" : "Chi nhánh" },
        header: groupBy === "day" ? "Ngày" : "Chi nhánh",
        cell: ({ row }) => keyLabel(row.original.key),
      },
      {
        id: "net",
        enableSorting: false,
        meta: { headerLabel: "Doanh thu thuần", align: "right" },
        header: "Doanh thu thuần",
        cell: ({ row }) => formatVnd(row.original.netRevenueVnd),
      },
      {
        id: "cogs",
        enableSorting: false,
        meta: { headerLabel: "Giá vốn (ước tính)", align: "right" },
        header: "Giá vốn (ước tính)",
        cell: ({ row }) => formatVnd(row.original.cogsVnd),
      },
      {
        id: "profit",
        enableSorting: false,
        meta: { headerLabel: "Lãi gộp", align: "right" },
        header: "Lãi gộp",
        cell: ({ row }) => formatVnd(row.original.grossProfitVnd),
      },
      {
        id: "pct",
        enableSorting: false,
        meta: { headerLabel: "%Biên", align: "right" },
        header: "%Biên",
        cell: ({ row }) => `${row.original.marginPct.toFixed(1)}%`,
      },
    ],
    // keyLabel closes over groupBy + branches; list both to keep column headers in sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupBy, branches],
  );

  const table = useDataTable<MarginRow>({
    data: rows,
    columns,
    total: rows.length,
    page: 1,
    limit: rows.length || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (r) => r.key,
  });

  return (
    <>
      {data && (
        <>
          <KpiRow>
            <KpiCard label="Doanh thu thuần" value={formatVnd(data.totals.netRevenueVnd)} />
            <KpiCard label="Giá vốn (TB ước tính)" value={formatVnd(data.totals.cogsVnd)} />
            <KpiCard label="Giá vốn (FIFO thực tế)" value={fifo.data ? formatVnd(fifo.data.totalCogsVnd) : "…"} />
            <KpiCard label="Lãi gộp" value={formatVnd(data.totals.grossProfitVnd)} />
            <KpiCard label="%Biên gộp" value={`${data.totals.marginPct.toFixed(1)}%`} />
          </KpiRow>
          <TotalsBar
            items={[
              { label: "Doanh thu thuần", value: formatVnd(data.totals.netRevenueVnd) },
              { label: "Giá vốn", value: formatVnd(data.totals.cogsVnd) },
              { label: "Lãi gộp", value: formatVnd(data.totals.grossProfitVnd) },
            ]}
          />
        </>
      )}

      <ListPageShell
        activePath="/reports/gross-margin"
        pageTitle="Báo cáo lãi gộp"
        actions={
          <Button variant="ghost" disabled={exporting} onClick={doExport}>
            {exporting ? "Đang xuất…" : "Xuất Excel"}
          </Button>
        }
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
            <input
              type="date"
              aria-label="Từ ngày"
              value={filter.from}
              onChange={(e) => patch({ from: e.target.value })}
              style={inputStyle}
            />
            <input
              type="date"
              aria-label="Đến ngày"
              value={filter.to}
              onChange={(e) => patch({ to: e.target.value })}
              style={inputStyle}
            />
            {isChainWide && (
              <Select aria-label="Chi nhánh" value={filter.branchId} onChange={(e) => patch({ branchId: e.target.value })}>
                <option value="">Tất cả chi nhánh</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code}{b.name ? ` — ${b.name}` : ""}
                  </option>
                ))}
              </Select>
            )}
            <Select aria-label="Nhóm theo" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
              <option value="day">Theo ngày</option>
              <option value="branch">Theo chi nhánh</option>
            </Select>
          </PageToolbar>
        }
        pagination={
          !isLoading && !isError
            ? <DataTablePagination table={table} total={rows.length} />
            : undefined
        }
      >
        {isLoading ? (
          <div style={{ padding: "var(--space-5)" }}>
            <LoadingState />
          </div>
        ) : isError ? (
          <div style={{ padding: "var(--space-5)" }}>
            <ErrorState message={toErrorMessage(error, "Không tải được báo cáo")} />
          </div>
        ) : (
          <DataTable table={table} empty="Không có dữ liệu trong khoảng đã chọn." />
        )}
      </ListPageShell>
    </>
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
