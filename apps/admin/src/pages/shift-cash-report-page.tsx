/**
 * ShiftCashReportPage — cash reconciliation for CLOSED shifts (expected vs
 * counted vs system cash). Read-only; branch-scoped + role-gated by the backend.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { formatVnd } from "@ilikebuffet/shared";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { useReport } from "../lib/use-report";
import { QUERY_KEYS } from "../lib/query-keys";
import { Card, PageStack, DataTable, Column, Badge, LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";
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

  const columns: Column<ShiftCashRow>[] = [
    { key: "date", header: "Ngày", render: (r) => r.businessDate },
    { key: "branch", header: "Chi nhánh", render: (r) => branchName(r.branchId) },
    { key: "expected", header: "Dự kiến", align: "right", render: (r) => formatVnd(r.expectedCashVnd) },
    { key: "counted", header: "Đếm thực", align: "right", render: (r) => formatVnd(r.countedCashVnd) },
    {
      key: "variance",
      header: "Chênh lệch",
      align: "right",
      render: (r) => (r.varianceVnd === 0 ? <span>0 ₫</span> : <Badge tone="warn">{formatVnd(r.varianceVnd)}</Badge>),
    },
    { key: "cash", header: "Tiền mặt hệ thống", align: "right", render: (r) => formatVnd(r.cashRevenueVnd) },
  ];

  return (
    <PageStack>
      <Card title="Đối soát tiền mặt theo ca" description="Chỉ ca đã đóng. Chênh lệch = đếm − dự kiến.">
        <DateRangeBar value={filter} onChange={patch} branches={isChainWide ? branches : undefined} />

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được đối soát")} />
        ) : data ? (
          <>
            <KpiRow>
              <KpiCard label="Tổng lệch" value={formatVnd(data.totals.varianceVnd)} tone={data.totals.varianceVnd !== 0 ? "warn" : "default"} sub={`${data.totals.shiftCount} ca`} />
              <KpiCard label="Ca thiếu" value={String(data.totals.shortCount)} tone={data.totals.shortCount > 0 ? "warn" : "default"} />
              <KpiCard label="Ca thừa" value={String(data.totals.overCount)} />
            </KpiRow>
            <DataTable columns={columns} rows={data.rows} rowKey={(r) => r.shiftId} emptyText="Không có ca đã đóng trong khoảng đã chọn." />
          </>
        ) : null}
      </Card>
    </PageStack>
  );
};
