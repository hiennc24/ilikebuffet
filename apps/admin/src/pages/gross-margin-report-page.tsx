/**
 * GrossMarginReportPage — lãi gộp = doanh thu thuần − giá vốn tiêu hao ước tính,
 * theo ngày/chi nhánh. Read-only; backend branch-scopes and role-gates. COGS is
 * an estimate from ticket recipes (labelled as such).
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { formatVnd } from "@ilikebuffet/shared";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { useReport } from "../lib/use-report";
import { buildQuery } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import { Card, PageStack, DataTable, Column, Select, LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";
import { KpiCard, KpiRow, DateRangeBar, TotalsBar, type Branch } from "./_shared/report-ui";

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
  const columns: Column<MarginRow>[] = [
    { key: "key", header: groupBy === "day" ? "Ngày" : "Chi nhánh", render: (r) => keyLabel(r.key) },
    { key: "net", header: "Doanh thu thuần", align: "right", render: (r) => formatVnd(r.netRevenueVnd) },
    { key: "cogs", header: "Giá vốn (ước tính)", align: "right", render: (r) => formatVnd(r.cogsVnd) },
    { key: "profit", header: "Lãi gộp", align: "right", render: (r) => formatVnd(r.grossProfitVnd) },
    { key: "pct", header: "%Biên", align: "right", render: (r) => `${r.marginPct.toFixed(1)}%` },
  ];

  return (
    <PageStack>
      <Card title="Báo cáo lãi gộp" description="Lãi gộp = doanh thu thuần − giá vốn tiêu hao (ước tính theo định mức). Bill huỷ không tính.">
        <DateRangeBar
          value={filter}
          onChange={patch}
          branches={isChainWide ? branches : undefined}
          right={
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
              <Select aria-label="Nhóm theo" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
                <option value="day">Theo ngày</option>
                <option value="branch">Theo chi nhánh</option>
              </Select>
              <Button variant="ghost" disabled={exporting} onClick={doExport}>
                {exporting ? "Đang xuất…" : "Xuất Excel"}
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được báo cáo")} />
        ) : data ? (
          <>
            <KpiRow>
              <KpiCard label="Doanh thu thuần" value={formatVnd(data.totals.netRevenueVnd)} />
              <KpiCard label="Giá vốn (TB ước tính)" value={formatVnd(data.totals.cogsVnd)} />
              <KpiCard label="Giá vốn (FIFO thực tế)" value={fifo.data ? formatVnd(fifo.data.totalCogsVnd) : "…"} />
              <KpiCard label="Lãi gộp" value={formatVnd(data.totals.grossProfitVnd)} />
              <KpiCard label="%Biên gộp" value={`${data.totals.marginPct.toFixed(1)}%`} />
            </KpiRow>

            <DataTable columns={columns} rows={data.rows} rowKey={(r) => r.key} emptyText="Không có dữ liệu trong khoảng đã chọn." />
            <TotalsBar
              items={[
                { label: "Doanh thu thuần", value: formatVnd(data.totals.netRevenueVnd) },
                { label: "Giá vốn", value: formatVnd(data.totals.cogsVnd) },
                { label: "Lãi gộp", value: formatVnd(data.totals.grossProfitVnd) },
              ]}
            />
          </>
        ) : null}
      </Card>
    </PageStack>
  );
};
