/**
 * ChainDashboardPage — consolidated chain overview (M10/X0). Chain-wide roles
 * only. Chain totals + a per-branch table ranked by net revenue, with cash
 * variance and low-stock flags. Read-only; the backend gates + branch-scopes.
 */
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { formatVnd } from "@ilikebuffet/shared";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { useReport } from "../lib/use-report";
import { buildQuery } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import { LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination, Badge } from "./_shared/table";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";
import { KpiCard, KpiRow, DateRangeBar } from "./_shared/report-ui";

const today = () => new Date().toISOString().slice(0, 10);

interface BranchRow {
  branchId: string;
  code: string;
  name: string;
  netRevenueVnd: number;
  billCount: number;
  guestCount: number;
  cashVarianceVnd: number;
  lowStockCount: number;
  rank: number;
}
interface ChainOverview {
  totals: { netRevenueVnd: number; billCount: number; guestCount: number; cashVarianceVnd: number; lowStockCount: number; branchCount: number };
  rows: BranchRow[];
}

const columns: ColumnDef<BranchRow>[] = [
  {
    id: "rank",
    enableSorting: false,
    meta: { headerLabel: "#", width: "48px" },
    header: "#",
    cell: ({ row }) => String(row.original.rank),
  },
  {
    id: "branch",
    enableSorting: false,
    meta: { headerLabel: "Chi nhánh" },
    header: "Chi nhánh",
    cell: ({ row }) => `${row.original.code} — ${row.original.name}`,
  },
  {
    id: "net",
    enableSorting: false,
    meta: { headerLabel: "Doanh thu thuần", align: "right" },
    header: "Doanh thu thuần",
    cell: ({ row }) => formatVnd(row.original.netRevenueVnd),
  },
  {
    id: "bills",
    enableSorting: false,
    meta: { headerLabel: "Số bill", align: "right" },
    header: "Số bill",
    cell: ({ row }) => row.original.billCount,
  },
  {
    id: "guests",
    enableSorting: false,
    meta: { headerLabel: "Khách", align: "right" },
    header: "Khách",
    cell: ({ row }) => row.original.guestCount,
  },
  {
    id: "variance",
    enableSorting: false,
    meta: { headerLabel: "Chênh lệch tiền ca", align: "right" },
    header: "Chênh lệch tiền ca",
    cell: ({ row }) =>
      row.original.cashVarianceVnd === 0 ? (
        <span>0 ₫</span>
      ) : (
        <Badge tone="warn">{formatVnd(row.original.cashVarianceVnd)}</Badge>
      ),
  },
  {
    id: "low",
    enableSorting: false,
    meta: { headerLabel: "Tồn thấp", align: "right" },
    header: "Tồn thấp",
    cell: ({ row }) =>
      row.original.lowStockCount > 0 ? (
        <Badge tone="warn">{row.original.lowStockCount}</Badge>
      ) : (
        <span>0</span>
      ),
  },
];

export const ChainDashboardPage: React.FC = () => {
  const { api } = useAuth();
  const [filter, setFilter] = React.useState({ from: today(), to: today() });
  const patch = (p: Partial<typeof filter>) => setFilter((f) => ({ ...f, ...p }));

  const [exporting, setExporting] = React.useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const blob = await api.download(`/sales/reports/chain-overview/export?${buildQuery(filter)}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tong-quan-chuoi-${filter.from}-${filter.to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const { data, isLoading, isError, error } = useReport<ChainOverview>({
    queryKey: QUERY_KEYS.chainOverviewReport(),
    path: "/sales/reports/chain-overview",
    params: filter,
  });

  const rows = data?.rows ?? [];

  const table = useDataTable<BranchRow>({
    data: rows,
    columns,
    total: rows.length,
    page: 1,
    limit: rows.length || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (r) => r.branchId,
  });

  return (
    <>
      {data && (
        <KpiRow>
          <KpiCard label="Doanh thu thuần chuỗi" value={formatVnd(data.totals.netRevenueVnd)} sub={`${data.totals.branchCount} chi nhánh`} />
          <KpiCard label="Số bill" value={String(data.totals.billCount)} />
          <KpiCard label="Khách" value={String(data.totals.guestCount)} />
          <KpiCard label="Chênh lệch tiền ca" value={formatVnd(data.totals.cashVarianceVnd)} tone={data.totals.cashVarianceVnd !== 0 ? "warn" : "default"} />
          <KpiCard label="Tồn thấp" value={String(data.totals.lowStockCount)} tone={data.totals.lowStockCount > 0 ? "warn" : "default"} />
        </KpiRow>
      )}

      <ListPageShell
        activePath="/reports/chain"
        pageTitle="Tổng quan chuỗi"
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
            <DateRangeBar value={{ ...filter, branchId: "" }} onChange={patch} />
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
            <ErrorState message={toErrorMessage(error, "Không tải được tổng quan chuỗi")} />
          </div>
        ) : (
          <DataTable table={table} empty="Chưa có dữ liệu chi nhánh." />
        )}
      </ListPageShell>
    </>
  );
};
