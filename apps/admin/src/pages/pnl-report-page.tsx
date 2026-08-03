/**
 * PnlReportPage — báo cáo lãi/lỗ = doanh thu thuần − giá vốn − chi phí vận hành,
 * theo ngày/chi nhánh. Read-only; backend branch-scopes and role-gates.
 *
 * Giá vốn là tiêu hao theo định mức (moving-average). Chi phí vận hành là các phiếu
 * chi KHÔNG gắn nhà cung cấp — thanh toán NCC đã nằm trong giá vốn nên không tính lại.
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
  const columns: Column<PnlRow>[] = [
    { key: "key", header: groupBy === "day" ? "Ngày" : "Chi nhánh", render: (r) => keyLabel(r.key) },
    { key: "net", header: "Doanh thu thuần", align: "right", render: (r) => formatVnd(r.netRevenueVnd) },
    { key: "cogs", header: "Giá vốn", align: "right", render: (r) => formatVnd(r.cogsVnd) },
    { key: "gross", header: "Lãi gộp", align: "right", render: (r) => formatVnd(r.grossProfitVnd) },
    { key: "opex", header: "Chi phí vận hành", align: "right", render: (r) => formatVnd(r.opexVnd) },
    { key: "profit", header: "Lãi ròng", align: "right", render: (r) => formatVnd(r.netProfitVnd) },
    { key: "pct", header: "%Biên ròng", align: "right", render: (r) => `${r.marginPct.toFixed(1)}%` },
  ];

  return (
    <PageStack>
      <Card
        title="Báo cáo lãi/lỗ"
        description="Lãi ròng = doanh thu thuần − giá vốn (tiêu hao ước tính) − chi phí vận hành. Thanh toán NCC không tính vào chi phí vận hành (đã nằm trong giá vốn)."
      >
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
              <KpiCard label="Giá vốn" value={formatVnd(data.totals.cogsVnd)} />
              <KpiCard label="Lãi gộp" value={formatVnd(data.totals.grossProfitVnd)} />
              <KpiCard label="Chi phí vận hành" value={formatVnd(data.totals.opexVnd)} />
              <KpiCard label="Lãi ròng" value={formatVnd(data.totals.netProfitVnd)} />
              <KpiCard label="%Biên ròng" value={`${data.totals.marginPct.toFixed(1)}%`} />
            </KpiRow>

            <DataTable columns={columns} rows={data.rows} rowKey={(r) => r.key} emptyText="Không có dữ liệu trong khoảng đã chọn." />
            <TotalsBar
              items={[
                { label: "Doanh thu thuần", value: formatVnd(data.totals.netRevenueVnd) },
                { label: "Giá vốn", value: formatVnd(data.totals.cogsVnd) },
                { label: "Chi phí vận hành", value: formatVnd(data.totals.opexVnd) },
                { label: "Lãi ròng", value: formatVnd(data.totals.netProfitVnd) },
              ]}
            />
          </>
        ) : null}
      </Card>
    </PageStack>
  );
};
