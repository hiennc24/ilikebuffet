/**
 * PnlReportPage — báo cáo lãi/lỗ = doanh thu thuần − giá vốn − chi phí vận hành,
 * theo ngày/chi nhánh. Read-only; backend branch-scopes and role-gates.
 *
 * Giá vốn là tiêu hao theo định mức (moving-average). Chi phí vận hành là các phiếu
 * chi KHÔNG gắn nhà cung cấp — thanh toán NCC đã nằm trong giá vốn nên không tính lại.
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
import { KpiCard, KpiRow, DateRangeBar, TotalsBar, type Branch } from "./_shared/report-ui";

const CHAIN_WIDE = new Set(["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI"]);
const today = () => new Date().toISOString().slice(0, 10);

interface PnlRow {
  key: string;
  netRevenueVnd: number;
  cogsVnd: number;
  grossProfitVnd: number;
  opexVnd: number;
  netProfitVnd: number;
  marginPct: number;
}
interface PnlReport {
  groupBy: "day" | "branch";
  totals: { netRevenueVnd: number; cogsVnd: number; grossProfitVnd: number; opexVnd: number; netProfitVnd: number; marginPct: number };
  rows: PnlRow[];
}

export const PnlReportPage: React.FC = () => {
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

  const { data, isLoading, isError, error } = useReport<PnlReport>({
    queryKey: QUERY_KEYS.pnlReport(),
    path: "/sales/reports/pnl",
    params: { ...filter, groupBy },
  });

  const patch = (p: Partial<typeof filter>) => setFilter((f) => ({ ...f, ...p }));

  const [exporting, setExporting] = React.useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const blob = await api.download(`/sales/reports/pnl/export?${buildQuery({ ...filter, groupBy })}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lai-lo-${filter.from}-${filter.to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const keyLabel = (key: string) => (groupBy === "branch" ? branchName(key) : key);

  const rows = data?.rows ?? [];

  const columns = React.useMemo<ColumnDef<PnlRow>[]>(
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
        meta: { headerLabel: "Giá vốn", align: "right" },
        header: "Giá vốn",
        cell: ({ row }) => formatVnd(row.original.cogsVnd),
      },
      {
        id: "gross",
        enableSorting: false,
        meta: { headerLabel: "Lãi gộp", align: "right" },
        header: "Lãi gộp",
        cell: ({ row }) => formatVnd(row.original.grossProfitVnd),
      },
      {
        id: "opex",
        enableSorting: false,
        meta: { headerLabel: "Chi phí vận hành", align: "right" },
        header: "Chi phí vận hành",
        cell: ({ row }) => formatVnd(row.original.opexVnd),
      },
      {
        id: "profit",
        enableSorting: false,
        meta: { headerLabel: "Lãi ròng", align: "right" },
        header: "Lãi ròng",
        cell: ({ row }) => formatVnd(row.original.netProfitVnd),
      },
      {
        id: "pct",
        enableSorting: false,
        meta: { headerLabel: "%Biên ròng", align: "right" },
        header: "%Biên ròng",
        cell: ({ row }) => `${row.original.marginPct.toFixed(1)}%`,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupBy, branches],
  );

  const table = useDataTable<PnlRow>({
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
            <KpiCard label="Giá vốn" value={formatVnd(data.totals.cogsVnd)} />
            <KpiCard label="Lãi gộp" value={formatVnd(data.totals.grossProfitVnd)} />
            <KpiCard label="Chi phí vận hành" value={formatVnd(data.totals.opexVnd)} />
            <KpiCard label="Lãi ròng" value={formatVnd(data.totals.netProfitVnd)} />
            <KpiCard label="%Biên ròng" value={`${data.totals.marginPct.toFixed(1)}%`} />
          </KpiRow>

          <TotalsBar
            items={[
              { label: "Doanh thu thuần", value: formatVnd(data.totals.netRevenueVnd) },
              { label: "Giá vốn", value: formatVnd(data.totals.cogsVnd) },
              { label: "Chi phí vận hành", value: formatVnd(data.totals.opexVnd) },
              { label: "Lãi ròng", value: formatVnd(data.totals.netProfitVnd) },
            ]}
          />
        </>
      )}

      <ListPageShell
        activePath="/reports/pnl"
        pageTitle="Báo cáo lãi/lỗ"
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
            <DateRangeBar
              value={filter}
              onChange={patch}
              branches={isChainWide ? branches : undefined}
              right={
                <Select aria-label="Nhóm theo" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
                  <option value="day">Theo ngày</option>
                  <option value="branch">Theo chi nhánh</option>
                </Select>
              }
            />
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
