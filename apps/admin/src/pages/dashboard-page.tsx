/**
 * DashboardPage — today's KPIs (net revenue, bills, guests, open shifts, open
 * quarantine). Branch-scoped by the backend; available to any admin user.
 */
import * as React from "react";
import { formatVnd } from "@ilikebuffet/shared";
import { useReport } from "../lib/use-report";
import { QUERY_KEYS } from "../lib/query-keys";
import { Card, PageStack, LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";
import { KpiCard, KpiRow } from "./_shared/report-ui";

interface Dashboard {
  date: string;
  todayNetVnd: number;
  todayBillCount: number;
  todayGuestCount: number;
  openShiftCount: number;
  quarantineOpenCount: number;
}

export const DashboardPage: React.FC = () => {
  const { data, isLoading, isError, error } = useReport<Dashboard>({
    queryKey: QUERY_KEYS.dashboardReport(),
    path: "/sales/reports/dashboard",
  });

  return (
    <PageStack>
      <Card title="Hôm nay" description={data ? `Ngày ${data.date}` : undefined}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được tổng quan")} />
        ) : data ? (
          <KpiRow>
            <KpiCard label="Doanh thu thuần hôm nay" value={formatVnd(data.todayNetVnd)} sub={`${data.todayBillCount} bill · ${data.todayGuestCount} khách`} />
            <KpiCard label="Ca đang mở" value={String(data.openShiftCount)} />
            <KpiCard label="Bill cách ly chờ xử lý" value={String(data.quarantineOpenCount)} tone={data.quarantineOpenCount > 0 ? "warn" : "default"} />
          </KpiRow>
        ) : null}
      </Card>
    </PageStack>
  );
};
