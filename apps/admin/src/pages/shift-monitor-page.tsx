/**
 * ShiftMonitorPage — realtime shift monitor for managers (BH-08).
 *
 * Lists the branch's OPEN shifts and polls the selected shift's summary every
 * 30s (≤60s requirement). Server enforces branch scope; the aggregate is
 * read-only. Comparison to the same shift last week is intentionally omitted
 * for the 2-week pilot (no prior week — gold-plating).
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { formatVnd } from "@ilikebuffet/shared";
import { useAuth } from "../auth/auth-context";
import { Card, DataTable, PageStack, LoadingState, ErrorState, EmptyState, toErrorMessage } from "./_shared/admin-ui";

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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", minWidth: "140px" }}>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{label}</span>
      <strong style={{ fontSize: "var(--text-lg)", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </strong>
    </div>
  );
}

export const ShiftMonitorPage: React.FC = () => {
  const { api, selectedBranchId } = useAuth();
  const [shiftId, setShiftId] = React.useState<string | null>(null);

  const openShiftsQuery = useQuery({
    queryKey: ["open-shifts", selectedBranchId],
    queryFn: () => api.get<OpenShift[]>(`/sales/shifts?status=OPEN&branchId=${selectedBranchId}`),
    enabled: !!selectedBranchId,
    refetchInterval: 60_000,
  });

  // Auto-select the first open shift once loaded.
  const openShifts = openShiftsQuery.data ?? [];
  React.useEffect(() => {
    if (!shiftId && openShifts.length > 0) setShiftId(openShifts[0].id);
  }, [shiftId, openShifts]);

  const summaryQuery = useQuery({
    queryKey: ["shift-summary", shiftId],
    queryFn: () => api.get<ShiftSummary>(`/sales/shifts/${shiftId}/summary`),
    enabled: !!shiftId,
    refetchInterval: 30_000, // realtime ≤60s
  });

  if (openShiftsQuery.isLoading) return <LoadingState />;
  if (openShiftsQuery.error) return <ErrorState message={toErrorMessage(openShiftsQuery.error)} />;

  const summary = summaryQuery.data;

  return (
    <PageStack>
      <Card
        title="Theo dõi ca"
        description="Cập nhật ~30 giây. Chỉ chi nhánh trong phạm vi."
        actions={
          openShifts.length > 0 ? (
            <select
              aria-label="Chọn ca"
              value={shiftId ?? ""}
              onChange={(e) => setShiftId(e.target.value)}
              style={{
                height: "36px",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                padding: "0 var(--space-3)",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
              }}
            >
              {openShifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.deviceId} · mở {new Date(s.openedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                </option>
              ))}
            </select>
          ) : undefined
        }
      >
        {openShifts.length === 0 ? (
          <EmptyState text="Không có ca đang mở tại chi nhánh này." />
        ) : !summary ? (
          <LoadingState />
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-5)" }}>
            <Metric label="Doanh thu" value={formatVnd(summary.revenueVnd)} />
            <Metric label="Số bill" value={summary.billCount} />
            <Metric label="Số khách" value={summary.guestCount} />
            <Metric label="Bill đã hủy" value={summary.cancelledCount} />
            <Metric label="Nhịp 30 phút" value={`${summary.last30mBills} bill`} />
          </div>
        )}
      </Card>

      {summary && summary.ticketsByType.length > 0 && (
        <Card title="Vé theo loại">
          <DataTable<TicketRow>
            rowKey={(r) => r.ticketTypeId}
            rows={summary.ticketsByType}
            columns={[
              { key: "name", header: "Loại vé", render: (r) => r.name },
              { key: "qty", header: "Số lượng", align: "right", render: (r) => r.qty },
            ]}
          />
        </Card>
      )}
    </PageStack>
  );
};
