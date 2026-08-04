/**
 * RevenueReportPage — net revenue (gross − refunds) by day / branch / shift.
 * Read-only; backend branch-scopes and role-gates. Export lands in R5.
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

interface RevRow {
  key: string;
  grossVnd: number;
  refundedVnd: number;
  netVnd: number;
  billCount: number;
  guestCount: number;
}

interface TicketTypeRow {
  ticketTypeId: string;
  name: string;
  qty: number;
  grossVnd: number;
}

interface RevReport {
  groupBy: "day" | "branch" | "shift";
  totals: { grossVnd: number; refundedVnd: number; netVnd: number; billCount: number; cancelledCount: number; guestCount: number };
  rows: RevRow[];
  byTicketType: TicketTypeRow[];
}

export const RevenueReportPage: React.FC = () => {
  const { api, role } = useAuth();
  const isChainWide = !!role && CHAIN_WIDE.has(role);
  const [filter, setFilter] = React.useState({ from: today(), to: today(), branchId: "" });
  const [groupBy, setGroupBy] = React.useState<"day" | "branch" | "shift">("day");

  const branchesQuery = useQuery({
    queryKey: QUERY_KEYS.branches(),
    enabled: isChainWide,
    queryFn: () => api.get<Branch[] | { data: Branch[] }>("/branches"),
  });
  const branches = unwrapList(branchesQuery.data);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.code ?? id;

  const { data, isLoading, isError, error } = useReport<RevReport>({
    queryKey: QUERY_KEYS.revenueReport(),
    path: "/sales/reports/revenue",
    params: { ...filter, groupBy },
  });

  const patch = (p: Partial<typeof filter>) => setFilter((f) => ({ ...f, ...p }));

  const [exporting, setExporting] = React.useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const blob = await api.download(`/sales/reports/revenue/export?${buildQuery({ ...filter, groupBy })}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `doanh-thu-${filter.from}-${filter.to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const keyLabel = (key: string) => (groupBy === "branch" ? branchName(key) : key);

  const rows = data?.rows ?? [];
  const ticketRows = data?.byTicketType ?? [];

  const mainColumns = React.useMemo<ColumnDef<RevRow>[]>(
    () => [
      {
        id: "key",
        enableSorting: false,
        meta: { headerLabel: groupBy === "day" ? "Ngày" : groupBy === "branch" ? "Chi nhánh" : "Ca" },
        header: groupBy === "day" ? "Ngày" : groupBy === "branch" ? "Chi nhánh" : "Ca",
        cell: ({ row }) => keyLabel(row.original.key),
      },
      {
        id: "gross",
        enableSorting: false,
        meta: { headerLabel: "Doanh thu gộp", align: "right" },
        header: "Doanh thu gộp",
        cell: ({ row }) => formatVnd(row.original.grossVnd),
      },
      {
        id: "refund",
        enableSorting: false,
        meta: { headerLabel: "Hoàn tiền", align: "right" },
        header: "Hoàn tiền",
        cell: ({ row }) => formatVnd(row.original.refundedVnd),
      },
      {
        id: "net",
        enableSorting: false,
        meta: { headerLabel: "Doanh thu thuần", align: "right" },
        header: "Doanh thu thuần",
        cell: ({ row }) => formatVnd(row.original.netVnd),
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
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupBy, branchName],
  );

  const ticketColumns = React.useMemo<ColumnDef<TicketTypeRow>[]>(
    () => [
      {
        id: "name",
        enableSorting: false,
        meta: { headerLabel: "Loại vé" },
        header: "Loại vé",
        cell: ({ row }) => row.original.name,
      },
      {
        id: "qty",
        enableSorting: false,
        meta: { headerLabel: "SL", align: "right" },
        header: "SL",
        cell: ({ row }) => row.original.qty,
      },
      {
        id: "gross",
        enableSorting: false,
        meta: { headerLabel: "Doanh thu", align: "right" },
        header: "Doanh thu",
        cell: ({ row }) => formatVnd(row.original.grossVnd),
      },
    ],
    [],
  );

  // Flat-array tables: total = rows.length, limit covers all rows, no real pagination.
  const mainTable = useDataTable<RevRow>({
    data: rows,
    columns: mainColumns,
    total: rows.length,
    page: 1,
    limit: rows.length || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (r) => r.key,
  });

  const ticketTable = useDataTable<TicketTypeRow>({
    data: ticketRows,
    columns: ticketColumns,
    total: ticketRows.length,
    page: 1,
    limit: ticketRows.length || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (r) => r.ticketTypeId,
  });

  return (
    <>
      {/* KPI cards and totals bar appear above the shell, only when data loaded */}
      {data && (
        <>
          <KpiRow>
            <KpiCard label="Doanh thu thuần" value={formatVnd(data.totals.netVnd)} sub={`${data.totals.billCount} bill · ${data.totals.guestCount} khách`} />
            <KpiCard label="Doanh thu gộp" value={formatVnd(data.totals.grossVnd)} />
            <KpiCard label="Hoàn tiền" value={formatVnd(data.totals.refundedVnd)} tone={data.totals.refundedVnd > 0 ? "warn" : "default"} />
            <KpiCard label="Bill huỷ" value={String(data.totals.cancelledCount)} />
          </KpiRow>
          <TotalsBar
            items={[
              { label: "Gộp", value: formatVnd(data.totals.grossVnd) },
              { label: "Hoàn", value: formatVnd(data.totals.refundedVnd) },
              { label: "Thuần", value: formatVnd(data.totals.netVnd) },
            ]}
          />
        </>
      )}

      <ListPageShell
        activePath="/reports/revenue"
        pageTitle="Báo cáo doanh thu"
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
                  <option value="shift">Theo ca</option>
                </Select>
              }
            />
          </PageToolbar>
        }
        pagination={
          !isLoading && !isError && data
            ? <DataTablePagination table={mainTable} total={rows.length} />
            : undefined
        }
      >
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được báo cáo")} />
        ) : data ? (
          <>
            <DataTable table={mainTable} empty="Không có dữ liệu trong khoảng đã chọn." />

            {ticketRows.length > 0 && (
              <div style={{ marginTop: "var(--space-5)", padding: "0 var(--space-4) var(--space-4)" }}>
                <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Theo loại vé</h3>
                <DataTable table={ticketTable} empty="" />
              </div>
            )}
          </>
        ) : null}
      </ListPageShell>
    </>
  );
};
