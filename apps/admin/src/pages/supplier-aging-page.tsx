/**
 * SupplierAgingPage — supplier-debt aging (tuổi nợ NCC) (E4/P3).
 *
 * Aging buckets each OPEN payable's outstanding by how overdue it is (chưa đến hạn
 * / 1-30 / 31-60 / 60+), grouped by supplier. A due-soon section lists payables
 * due within 7 days or already overdue. Read-only; backend branch-scopes + gates.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatVnd } from "@ilikebuffet/shared";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { useReport } from "../lib/use-report";
import { QUERY_KEYS } from "../lib/query-keys";
import { Card, Select, LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination, Badge } from "./_shared/table";
import { KpiCard, KpiRow, TotalsBar, type Branch } from "./_shared/report-ui";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";

const CHAIN_WIDE = new Set(["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI"]);

interface AgingRow {
  supplierId: string;
  supplierName: string;
  notDueVnd: number;
  d1_30Vnd: number;
  d31_60Vnd: number;
  d60plusVnd: number;
  totalOutstandingVnd: number;
}
interface AgingReport {
  totals: { notDueVnd: number; d1_30Vnd: number; d31_60Vnd: number; d60plusVnd: number; totalOutstandingVnd: number; supplierCount: number };
  suppliers: AgingRow[];
}
interface DueSoonItem {
  id: string;
  supplierName: string;
  outstandingVnd: number;
  dueDate: string | null;
  daysOverdue: number;
}

const vnDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export const SupplierAgingPage: React.FC = () => {
  const { api, role } = useAuth();
  const isChainWide = !!role && CHAIN_WIDE.has(role);
  const [branchId, setBranchId] = React.useState("");

  const branchesQuery = useQuery({
    queryKey: QUERY_KEYS.branches(),
    enabled: isChainWide,
    queryFn: () => api.get<Branch[] | { data: Branch[] }>("/branches"),
  });
  const branches = unwrapList(branchesQuery.data);

  const params = branchId ? { branchId } : {};
  const aging = useReport<AgingReport>({ queryKey: QUERY_KEYS.payableAging(), path: "/sales/finance/payables/aging", params });
  const dueSoon = useReport<{ items: DueSoonItem[]; total: number }>({ queryKey: QUERY_KEYS.payableDueSoon(), path: "/sales/finance/payables/due-soon", params });

  const [exporting, setExporting] = React.useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const qs = branchId ? `?branchId=${branchId}` : "";
      const blob = await api.download(`/sales/finance/payables/aging/export${qs}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tuoi-no-ncc.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const agingRows = aging.data?.suppliers ?? [];

  const columns = React.useMemo<ColumnDef<AgingRow>[]>(
    () => [
      {
        id: "supplier",
        enableSorting: false,
        meta: { headerLabel: "Nhà cung cấp" },
        header: "Nhà cung cấp",
        cell: ({ row }) => row.original.supplierName,
      },
      {
        id: "notDue",
        enableSorting: false,
        meta: { headerLabel: "Chưa đến hạn", align: "right" },
        header: "Chưa đến hạn",
        cell: ({ row }) => formatVnd(row.original.notDueVnd),
      },
      {
        id: "d1_30",
        enableSorting: false,
        meta: { headerLabel: "1-30 ngày", align: "right" },
        header: "1-30 ngày",
        cell: ({ row }) => formatVnd(row.original.d1_30Vnd),
      },
      {
        id: "d31_60",
        enableSorting: false,
        meta: { headerLabel: "31-60 ngày", align: "right" },
        header: "31-60 ngày",
        cell: ({ row }) => formatVnd(row.original.d31_60Vnd),
      },
      {
        id: "d60",
        enableSorting: false,
        meta: { headerLabel: "60+ ngày", align: "right" },
        header: "60+ ngày",
        cell: ({ row }) => formatVnd(row.original.d60plusVnd),
      },
      {
        id: "total",
        enableSorting: false,
        meta: { headerLabel: "Tổng nợ", align: "right" },
        header: "Tổng nợ",
        cell: ({ row }) => formatVnd(row.original.totalOutstandingVnd),
      },
    ],
    [],
  );

  const table = useDataTable<AgingRow>({
    data: agingRows,
    columns,
    total: agingRows.length,
    page: 1,
    limit: agingRows.length || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (r) => r.supplierId,
  });

  const dueSoonRows = dueSoon.data?.items ?? [];

  const dueColumns = React.useMemo<ColumnDef<DueSoonItem>[]>(
    () => [
      {
        id: "supplier",
        enableSorting: false,
        meta: { headerLabel: "Nhà cung cấp" },
        header: "Nhà cung cấp",
        cell: ({ row }) => row.original.supplierName,
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
        cell: ({ row }) => vnDate(row.original.dueDate),
      },
      {
        id: "days",
        enableSorting: false,
        meta: { headerLabel: "Trạng thái hạn" },
        header: "Trạng thái hạn",
        cell: ({ row }) =>
          row.original.daysOverdue > 0 ? (
            <Badge tone="warn">{`Quá ${row.original.daysOverdue} ngày`}</Badge>
          ) : (
            `Còn ${-row.original.daysOverdue} ngày`
          ),
      },
    ],
    [],
  );

  const dueTable = useDataTable<DueSoonItem>({
    data: dueSoonRows,
    columns: dueColumns,
    total: dueSoonRows.length,
    page: 1,
    limit: dueSoonRows.length || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (r) => r.id,
  });

  const overdueVnd = aging.data ? aging.data.totals.d1_30Vnd + aging.data.totals.d31_60Vnd + aging.data.totals.d60plusVnd : 0;

  return (
    <>
      {/* KPI summary floats above the panel, like the other report pages. */}
      {aging.data && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <KpiRow>
            <KpiCard label="Tổng công nợ" value={formatVnd(aging.data.totals.totalOutstandingVnd)} />
            <KpiCard label="Quá hạn" value={formatVnd(overdueVnd)} />
            <KpiCard label="Chưa đến hạn" value={formatVnd(aging.data.totals.notDueVnd)} />
            <KpiCard label="Số NCC còn nợ" value={String(aging.data.totals.supplierCount)} />
          </KpiRow>
        </div>
      )}
      <ListPageShell
        activePath="/finance/aging"
        pageTitle="Tuổi nợ NCC"
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
                items={[{ value: "list", label: "Danh sách", count: agingRows.length }]}
              />
            }
          >
            {isChainWide && (
              <Select aria-label="Chi nhánh" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Tất cả chi nhánh</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </Select>
            )}
          </PageToolbar>
        }
        pagination={
          !aging.isLoading && !aging.isError
            ? <DataTablePagination table={table} total={agingRows.length} />
            : undefined
        }
      >
        {aging.isLoading ? (
          <div style={{ padding: "var(--space-5)" }}>
            <LoadingState />
          </div>
        ) : aging.isError ? (
          <div style={{ padding: "var(--space-5)" }}>
            <ErrorState message={toErrorMessage(aging.error, "Không tải được tuổi nợ")} />
          </div>
        ) : aging.data ? (
          <>
            <DataTable table={table} empty="Không có công nợ." />
            <div style={{ padding: "var(--space-4)" }}>
              <TotalsBar
                items={[
                  { label: "Chưa đến hạn", value: formatVnd(aging.data.totals.notDueVnd) },
                  { label: "1-30", value: formatVnd(aging.data.totals.d1_30Vnd) },
                  { label: "31-60", value: formatVnd(aging.data.totals.d31_60Vnd) },
                  { label: "60+", value: formatVnd(aging.data.totals.d60plusVnd) },
                  { label: "Tổng nợ", value: formatVnd(aging.data.totals.totalOutstandingVnd) },
                ]}
              />
            </div>
          </>
        ) : null}
      </ListPageShell>

      <Card title="Sắp / đã đến hạn">
        {dueSoon.isLoading ? (
          <LoadingState />
        ) : dueSoon.isError ? (
          <ErrorState message={toErrorMessage(dueSoon.error, "Không tải được danh sách đến hạn")} />
        ) : (
          <DataTable table={dueTable} empty="Không có khoản nào sắp đến hạn." />
        )}
      </Card>
    </>
  );
};
