/**
 * RevenueReportPage — net revenue (gross − refunds) by day / branch / shift.
 * Read-only; backend branch-scopes and role-gates. Export lands in R5.
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

interface RevRow {
  key: string;
  grossVnd: number;
  refundedVnd: number;
  netVnd: number;
  billCount: number;
  guestCount: number;
}
interface RevReport {
  groupBy: "day" | "branch" | "shift";
  totals: { grossVnd: number; refundedVnd: number; netVnd: number; billCount: number; cancelledCount: number; guestCount: number };
  rows: RevRow[];
  byTicketType: { ticketTypeId: string; name: string; qty: number; grossVnd: number }[];
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
  const columns: Column<RevRow>[] = [
    { key: "key", header: groupBy === "day" ? "Ngày" : groupBy === "branch" ? "Chi nhánh" : "Ca", render: (r) => keyLabel(r.key) },
    { key: "gross", header: "Doanh thu gộp", align: "right", render: (r) => formatVnd(r.grossVnd) },
    { key: "refund", header: "Hoàn tiền", align: "right", render: (r) => formatVnd(r.refundedVnd) },
    { key: "net", header: "Doanh thu thuần", align: "right", render: (r) => formatVnd(r.netVnd) },
    { key: "bills", header: "Số bill", align: "right", render: (r) => r.billCount },
    { key: "guests", header: "Khách", align: "right", render: (r) => r.guestCount },
  ];

  return (
    <PageStack>
      <Card title="Báo cáo doanh thu" description="Doanh thu thuần = gộp − hoàn tiền; bill huỷ không tính.">
        <DateRangeBar
          value={filter}
          onChange={patch}
          branches={isChainWide ? branches : undefined}
          right={
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
              <Select aria-label="Nhóm theo" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
                <option value="day">Theo ngày</option>
                <option value="branch">Theo chi nhánh</option>
                <option value="shift">Theo ca</option>
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
              <KpiCard label="Doanh thu thuần" value={formatVnd(data.totals.netVnd)} sub={`${data.totals.billCount} bill · ${data.totals.guestCount} khách`} />
              <KpiCard label="Doanh thu gộp" value={formatVnd(data.totals.grossVnd)} />
              <KpiCard label="Hoàn tiền" value={formatVnd(data.totals.refundedVnd)} tone={data.totals.refundedVnd > 0 ? "warn" : "default"} />
              <KpiCard label="Bill huỷ" value={String(data.totals.cancelledCount)} />
            </KpiRow>

            <DataTable columns={columns} rows={data.rows} rowKey={(r) => r.key} emptyText="Không có dữ liệu trong khoảng đã chọn." />
            <TotalsBar
              items={[
                { label: "Gộp", value: formatVnd(data.totals.grossVnd) },
                { label: "Hoàn", value: formatVnd(data.totals.refundedVnd) },
                { label: "Thuần", value: formatVnd(data.totals.netVnd) },
              ]}
            />

            {data.byTicketType.length > 0 && (
              <div style={{ marginTop: "var(--space-5)" }}>
                <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Theo loại vé</h3>
                <DataTable
                  columns={[
                    { key: "name", header: "Loại vé", render: (t: { name: string }) => t.name },
                    { key: "qty", header: "SL", align: "right", render: (t: { qty: number }) => t.qty },
                    { key: "gross", header: "Doanh thu", align: "right", render: (t: { grossVnd: number }) => formatVnd(t.grossVnd) },
                  ]}
                  rows={data.byTicketType}
                  rowKey={(t) => t.ticketTypeId}
                  emptyText=""
                />
              </div>
            )}
          </>
        ) : null}
      </Card>
    </PageStack>
  );
};
