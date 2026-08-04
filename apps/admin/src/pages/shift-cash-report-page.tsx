/**
 * ShiftCashReportPage — cash reconciliation for CLOSED shifts (expected vs
 * counted vs system cash). Read-only; branch-scoped + role-gated by the backend.
 */
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { formatVnd } from "@ilikebuffet/shared";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { useReport } from "../lib/use-report";
import { buildQuery } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import { LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination, Badge } from "./_shared/table";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";
import { KpiCard, KpiRow, DateRangeBar, type Branch } from "./_shared/report-ui";

const CHAIN_WIDE = new Set(["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI"]);
const today = () => new Date().toISOString().slice(0, 10);

interface ShiftCashRow {
  shiftId: string;
  branchId: string;
  businessDate: string;
  expectedCashVnd: number;
  countedCashVnd: number;
  varianceVnd: number;
  varianceNote: string | null;
  cashRevenueVnd: number;
}
interface ShiftCashReport {
  totals: { varianceVnd: number; shortCount: number; overCount: number; shiftCount: number };
  rows: ShiftCashRow[];
}

export const ShiftCashReportPage: React.FC = () => {
  const { api, role } = useAuth();
  const isChainWide = !!role && CHAIN_WIDE.has(role);
  const [filter, setFilter] = React.useState({ from: today(), to: today(), branchId: "" });

  const branchesQuery = useQuery({ queryKey: QUERY_KEYS.branches(), enabled: isChainWide, queryFn: () => api.get<Branch[] | { data: Branch[] }>("/branches") });
  const branches = unwrapList(branchesQuery.data);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.code ?? id;

  const { data, isLoading, isError, error } = useReport<ShiftCashReport>({
    queryKey: QUERY_KEYS.shiftCashReport(),
    path: "/sales/reports/shift-cash",
    params: filter,
  });

  const patch = (p: Partial<typeof filter>) => setFilter((f) => ({ ...f, ...p }));

  const [exporting, setExporting] = React.useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const blob = await api.download(`/sales/reports/shift-cash/export?${buildQuery(filter)}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `doi-soat-tien-ca-${filter.from}-${filter.to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const rows = data?.rows ?? [];

  const columns = React.useMemo<ColumnDef<ShiftCashRow>[]>(
    () => [
      {
        id: "date",
        enableSorting: false,
        meta: { headerLabel: "Ngày" },
        header: "Ngày",
        cell: ({ row }) => row.original.businessDate,
      },
      {
        id: "branch",
        enableSorting: false,
        meta: { headerLabel: "Chi nhánh" },
        header: "Chi nhánh",
        cell: ({ row }) => branchName(row.original.branchId),
      },
      {
        id: "expected",
        enableSorting: false,
        meta: { headerLabel: "Dự kiến", align: "right" },
        header: "Dự kiến",
        cell: ({ row }) => formatVnd(row.original.expectedCashVnd),
      },
      {
        id: "counted",
        enableSorting: false,
        meta: { headerLabel: "Đếm thực", align: "right" },
        header: "Đếm thực",
        cell: ({ row }) => formatVnd(row.original.countedCashVnd),
      },
      {
        id: "variance",
        enableSorting: false,
        meta: { headerLabel: "Chênh lệch", align: "right" },
        header: "Chênh lệch",
        cell: ({ row }) =>
          row.original.varianceVnd === 0 ? (
            <span>0 ₫</span>
          ) : (
            <Badge tone="warn">{formatVnd(row.original.varianceVnd)}</Badge>
          ),
      },
      {
        id: "cash",
        enableSorting: false,
        meta: { headerLabel: "Tiền mặt hệ thống", align: "right" },
        header: "Tiền mặt hệ thống",
        cell: ({ row }) => formatVnd(row.original.cashRevenueVnd),
      },
    ],
    // branchName depends on branches, but branches is derived from query data and is
    // referentially stable between renders when the query hasn't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches],
  );

  const table = useDataTable<ShiftCashRow>({
    data: rows,
    columns,
    total: rows.length,
    page: 1,
    limit: rows.length || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (r) => r.shiftId,
  });

  return (
    <>
      {data && (
        <KpiRow>
          <KpiCard label="Tổng lệch" value={formatVnd(data.totals.varianceVnd)} tone={data.totals.varianceVnd !== 0 ? "warn" : "default"} sub={`${data.totals.shiftCount} ca`} />
          <KpiCard label="Ca thiếu" value={String(data.totals.shortCount)} tone={data.totals.shortCount > 0 ? "warn" : "default"} />
          <KpiCard label="Ca thừa" value={String(data.totals.overCount)} />
        </KpiRow>
      )}

      <ListPageShell
        activePath="/reports/shift-cash"
        pageTitle="Đối soát tiền mặt"
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
            <ErrorState message={toErrorMessage(error, "Không tải được đối soát")} />
          </div>
        ) : (
          <DataTable table={table} empty="Không có ca đã đóng trong khoảng đã chọn." />
        )}
      </ListPageShell>
    </>
  );
};
