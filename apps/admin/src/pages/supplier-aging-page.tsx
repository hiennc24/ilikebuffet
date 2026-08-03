/**
 * SupplierAgingPage — supplier-debt aging (tuổi nợ NCC) (E4/P3).
 *
 * Aging buckets each OPEN payable's outstanding by how overdue it is (chưa đến hạn
 * / 1-30 / 31-60 / 60+), grouped by supplier. A due-soon section lists payables
 * due within 7 days or already overdue. Read-only; backend branch-scopes + gates.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { formatVnd } from "@ilikebuffet/shared";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { useReport } from "../lib/use-report";
import { QUERY_KEYS } from "../lib/query-keys";
import { Card, PageStack, DataTable, Column, Select, Badge, LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";
import { KpiCard, KpiRow, TotalsBar, type Branch } from "./_shared/report-ui";

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

  const columns: Column<AgingRow>[] = [
    { key: "supplier", header: "Nhà cung cấp", render: (r) => r.supplierName },
    { key: "notDue", header: "Chưa đến hạn", align: "right", render: (r) => formatVnd(r.notDueVnd) },
    { key: "d1_30", header: "1-30 ngày", align: "right", render: (r) => formatVnd(r.d1_30Vnd) },
    { key: "d31_60", header: "31-60 ngày", align: "right", render: (r) => formatVnd(r.d31_60Vnd) },
    { key: "d60", header: "60+ ngày", align: "right", render: (r) => formatVnd(r.d60plusVnd) },
    { key: "total", header: "Tổng nợ", align: "right", render: (r) => formatVnd(r.totalOutstandingVnd) },
  ];

  const dueColumns: Column<DueSoonItem>[] = [
    { key: "supplier", header: "Nhà cung cấp", render: (r) => r.supplierName },
    { key: "out", header: "Còn nợ", align: "right", render: (r) => formatVnd(r.outstandingVnd) },
    { key: "due", header: "Hạn", render: (r) => vnDate(r.dueDate) },
    {
      key: "days",
      header: "Trạng thái hạn",
      render: (r) => (r.daysOverdue > 0 ? <Badge tone="warn">{`Quá ${r.daysOverdue} ngày`}</Badge> : `Còn ${-r.daysOverdue} ngày`),
    },
  ];

  const overdueVnd = aging.data ? aging.data.totals.d1_30Vnd + aging.data.totals.d31_60Vnd + aging.data.totals.d60plusVnd : 0;

  return (
    <PageStack>
      <Card
        title="Tuổi nợ nhà cung cấp"
        description="Công nợ NCC còn nợ, phân theo tuổi nợ so với hạn thanh toán."
        actions={
          <Button variant="ghost" disabled={exporting} onClick={doExport}>
            {exporting ? "Đang xuất…" : "Xuất Excel"}
          </Button>
        }
      >
        {isChainWide && (
          <div style={{ marginBottom: "var(--space-3)" }}>
            <Select aria-label="Chi nhánh" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Tất cả chi nhánh</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {aging.isLoading ? (
          <LoadingState />
        ) : aging.isError ? (
          <ErrorState message={toErrorMessage(aging.error, "Không tải được tuổi nợ")} />
        ) : aging.data ? (
          <>
            <KpiRow>
              <KpiCard label="Tổng công nợ" value={formatVnd(aging.data.totals.totalOutstandingVnd)} />
              <KpiCard label="Quá hạn" value={formatVnd(overdueVnd)} />
              <KpiCard label="Chưa đến hạn" value={formatVnd(aging.data.totals.notDueVnd)} />
              <KpiCard label="Số NCC còn nợ" value={String(aging.data.totals.supplierCount)} />
            </KpiRow>

            <DataTable columns={columns} rows={aging.data.suppliers} rowKey={(r) => r.supplierId} emptyText="Không có công nợ." />
            <TotalsBar
              items={[
                { label: "Chưa đến hạn", value: formatVnd(aging.data.totals.notDueVnd) },
                { label: "1-30", value: formatVnd(aging.data.totals.d1_30Vnd) },
                { label: "31-60", value: formatVnd(aging.data.totals.d31_60Vnd) },
                { label: "60+", value: formatVnd(aging.data.totals.d60plusVnd) },
                { label: "Tổng nợ", value: formatVnd(aging.data.totals.totalOutstandingVnd) },
              ]}
            />
          </>
        ) : null}
      </Card>

      <Card title="Sắp / đã đến hạn" description="Công nợ đến hạn trong 7 ngày hoặc đã quá hạn.">
        {dueSoon.isLoading ? (
          <LoadingState />
        ) : dueSoon.isError ? (
          <ErrorState message={toErrorMessage(dueSoon.error, "Không tải được danh sách đến hạn")} />
        ) : (
          <DataTable columns={dueColumns} rows={dueSoon.data?.items ?? []} rowKey={(r) => r.id} emptyText="Không có khoản nào sắp đến hạn." />
        )}
      </Card>
    </PageStack>
  );
};
