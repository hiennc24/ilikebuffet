/**
 * ChainDashboardPage — consolidated chain overview (M10/X0). Chain-wide roles
 * only. Chain totals + a per-branch table ranked by net revenue, with cash
 * variance and low-stock flags. Read-only; the backend gates + branch-scopes.
 */
import * as React from "react";
import { formatVnd } from "@ilikebuffet/shared";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { useReport } from "../lib/use-report";
import { buildQuery } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import { Card, PageStack, DataTable, Column, Badge, LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";
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

  const columns: Column<BranchRow>[] = [
    { key: "rank", header: "#", render: (r) => String(r.rank) },
    { key: "branch", header: "Chi nhánh", render: (r) => `${r.code} — ${r.name}` },
    { key: "net", header: "Doanh thu thuần", align: "right", render: (r) => formatVnd(r.netRevenueVnd) },
    { key: "bills", header: "Số bill", align: "right", render: (r) => r.billCount },
    { key: "guests", header: "Khách", align: "right", render: (r) => r.guestCount },
    {
      key: "variance",
      header: "Chênh lệch tiền ca",
      align: "right",
      render: (r) => (r.cashVarianceVnd === 0 ? <span>0 ₫</span> : <Badge tone="warn">{formatVnd(r.cashVarianceVnd)}</Badge>),
    },
    { key: "low", header: "Tồn thấp", align: "right", render: (r) => (r.lowStockCount > 0 ? <Badge tone="warn">{r.lowStockCount}</Badge> : <span>0</span>) },
  ];

  return (
    <PageStack>
      <Card title="Tổng quan chuỗi" description="Hợp nhất toàn chuỗi theo chi nhánh, xếp hạng theo doanh thu thuần.">
        <DateRangeBar
          value={{ ...filter, branchId: "" }}
          onChange={patch}
          right={
            <Button variant="ghost" disabled={exporting} onClick={doExport}>
              {exporting ? "Đang xuất…" : "Xuất Excel"}
            </Button>
          }
        />

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được tổng quan chuỗi")} />
        ) : data ? (
          <>
            <KpiRow>
              <KpiCard label="Doanh thu thuần chuỗi" value={formatVnd(data.totals.netRevenueVnd)} sub={`${data.totals.branchCount} chi nhánh`} />
              <KpiCard label="Số bill" value={String(data.totals.billCount)} />
              <KpiCard label="Khách" value={String(data.totals.guestCount)} />
              <KpiCard label="Chênh lệch tiền ca" value={formatVnd(data.totals.cashVarianceVnd)} tone={data.totals.cashVarianceVnd !== 0 ? "warn" : "default"} />
              <KpiCard label="Tồn thấp" value={String(data.totals.lowStockCount)} tone={data.totals.lowStockCount > 0 ? "warn" : "default"} />
            </KpiRow>

            <DataTable columns={columns} rows={data.rows} rowKey={(r) => r.branchId} emptyText="Chưa có dữ liệu chi nhánh." />
          </>
        ) : null}
      </Card>
    </PageStack>
  );
};
