/**
 * ShiftMonitorPage — realtime shift monitor for managers.
 *
 * Lists the branch's OPEN shifts and polls the selected shift's summary every
 * 30s (≤60s requirement). Server enforces branch scope; the aggregate is
 * read-only. Comparison to the same shift last week is intentionally omitted
 * for the 2-week pilot (no prior week — gold-plating).
 */

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "../lib/query-keys";
import { formatVnd } from "@ilikebuffet/shared";
import { useAuth } from "../auth/auth-context";
import { Select, LoadingState, ErrorState, EmptyState, toErrorMessage } from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination } from "./_shared/table";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";
import { KpiCard, KpiRow } from "./_shared/report-ui";

interface OpenShift {
  id: string;
  deviceId: string;
  openedAt: string;
}

interface TicketRow {
  ticketTypeId: string;
  name: string;
  qty: number;
}

interface ShiftSummary {
  shiftId: string;
  status: string;
  billCount: number;
  cancelledCount: number;
  revenueVnd: number;
  guestCount: number;
  ticketsByType: TicketRow[];
  last30mBills: number;
}

const TICKET_COLUMNS: ColumnDef<TicketRow>[] = [
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
    meta: { headerLabel: "Số lượng", align: "right" },
    header: "Số lượng",
    cell: ({ row }) => row.original.qty,
  },
];

export const ShiftMonitorPage: React.FC = () => {
  const { api, selectedBranchId } = useAuth();
  const [shiftId, setShiftId] = React.useState<string | null>(null);

  const openShiftsQuery = useQuery({
    queryKey: QUERY_KEYS.openShifts(selectedBranchId),
    queryFn: () => api.get<OpenShift[]>(`/sales/shifts?status=OPEN&branchId=${selectedBranchId}`),
    enabled: !!selectedBranchId,
    refetchInterval: 60_000,
  });

  const openShifts = openShiftsQuery.data ?? [];

  // Keep selected shift in sync with the polled open-shift list:
  //   1. Auto-select the first shift when none is selected and shifts exist.
  //   2. If the selected shift has closed (no longer in the list), fall back
  //      to the first remaining shift, or null if no shifts are open.
  //      Without this, the summary query fires on a stale ID, gets a 404,
  //      and the UI shows a permanent loading spinner.
  React.useEffect(() => {
    if (openShiftsQuery.isLoading) return;
    const ids = openShifts.map((s) => s.id);
    if (shiftId && !ids.includes(shiftId)) {
      // Selected shift closed — reset to first available or null.
      setShiftId(openShifts[0]?.id ?? null);
    } else if (!shiftId && openShifts.length > 0) {
      // Initial auto-select.
      setShiftId(openShifts[0].id);
    }
  }, [openShifts, openShiftsQuery.isLoading, shiftId]);

  const summaryQuery = useQuery({
    queryKey: QUERY_KEYS.shiftSummary(shiftId),
    queryFn: () => api.get<ShiftSummary>(`/sales/shifts/${shiftId}/summary`),
    enabled: !!shiftId,
    refetchInterval: 30_000, // realtime ≤60s
  });

  if (openShiftsQuery.isLoading) return <LoadingState />;
  if (openShiftsQuery.error) return <ErrorState message={toErrorMessage(openShiftsQuery.error)} />;

  const summary = summaryQuery.data;
  const tickets = summary?.ticketsByType ?? [];

  return (
    <TicketTableView
      openShifts={openShifts}
      shiftId={shiftId}
      setShiftId={setShiftId}
      summary={summary}
      tickets={tickets}
      summaryLoading={summaryQuery.isLoading}
    />
  );
};

interface TicketTableViewProps {
  openShifts: OpenShift[];
  shiftId: string | null;
  setShiftId: (id: string) => void;
  summary: ShiftSummary | undefined;
  tickets: TicketRow[];
  summaryLoading: boolean;
}

/**
 * Presentational layer — extracted so `useDataTable` (which needs stable data)
 * can be called unconditionally while the guard logic stays in ShiftMonitorPage.
 */
const TicketTableView: React.FC<TicketTableViewProps> = ({
  openShifts,
  shiftId,
  setShiftId,
  summary,
  tickets,
  summaryLoading,
}) => {
  const total = tickets.length;

  const table = useDataTable<TicketRow>({
    data: tickets,
    columns: TICKET_COLUMNS,
    total,
    page: 1,
    limit: total || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (r) => r.ticketTypeId,
  });

  const shiftActions =
    openShifts.length > 0 ? (
      <Select
        aria-label="Chọn ca"
        value={shiftId ?? ""}
        onChange={(e) => setShiftId(e.target.value)}
        height="36px"
      >
        {openShifts.map((s) => (
          <option key={s.id} value={s.id}>
            {s.deviceId} · mở{" "}
            {new Date(s.openedAt).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </option>
        ))}
      </Select>
    ) : undefined;

  return (
    <>
      {/* KPI row — shown once summary is loaded; floats above the shell */}
      {summary && openShifts.length > 0 && (
        <KpiRow>
          <KpiCard label="Doanh thu" value={formatVnd(summary.revenueVnd)} />
          <KpiCard label="Số bill" value={String(summary.billCount)} />
          <KpiCard label="Số khách" value={String(summary.guestCount)} />
          <KpiCard label="Bill đã hủy" value={String(summary.cancelledCount)} />
          <KpiCard label="Nhịp 30 phút" value={`${summary.last30mBills} bill`} />
        </KpiRow>
      )}

      <ListPageShell
        activePath="/monitor"
        pageTitle="Theo dõi ca"
        actions={shiftActions}
        toolbar={
          <PageToolbar
            left={
              <PageTabs
                value="list"
                onChange={() => {}}
                items={[{ value: "list", label: "Danh sách", count: total }]}
              />
            }
          />
        }
        pagination={
          openShifts.length > 0 && summary && total > 0
            ? <DataTablePagination table={table} total={total} />
            : undefined
        }
      >
        {openShifts.length === 0 ? (
          <div style={{ padding: "var(--space-5)" }}>
            <EmptyState text="Không có ca đang mở tại chi nhánh này." />
          </div>
        ) : summaryLoading ? (
          <div style={{ padding: "var(--space-5)" }}>
            <LoadingState />
          </div>
        ) : (
          <DataTable table={table} empty="Chưa có dữ liệu vé." />
        )}
      </ListPageShell>
    </>
  );
};
