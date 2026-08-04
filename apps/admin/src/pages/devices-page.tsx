/**
 * DevicesPage — POS device registry (list + suspend). Branch-scoped by the
 * backend; HQ + branch managers only. The one-time device secret is issued at
 * registration on the POS side and is never shown here.
 */
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  Card,
  PageStack,
  DetailDrawer,
  InlineError,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import { DataTable, useDataTable, Badge } from "./_shared/table";
import type { BadgeTone } from "./_shared/table";

type DeviceStatus = "ACTIVE" | "SUSPENDED";
interface Device {
  id: string;
  deviceId: string;
  branchId: string;
  label: string | null;
  status: DeviceStatus;
  createdAt: string;
}

const STATUS_TONE: Record<DeviceStatus, BadgeTone> = { ACTIVE: "success", SUSPENDED: "warn" };
const STATUS_LABEL: Record<DeviceStatus, string> = { ACTIVE: "Hoạt động", SUSPENDED: "Tạm ngưng" };

export const DevicesPage: React.FC = () => {
  const { api } = useAuth();
  const [selected, setSelected] = React.useState<Device | null>(null);

  const listQuery = useQuery({
    queryKey: QUERY_KEYS.devices(),
    queryFn: () => api.get<Device[] | { data: Device[] }>("/platform/devices"),
  });
  const rows = unwrapList(listQuery.data);

  const columns = React.useMemo<ColumnDef<Device>[]>(
    () => [
      {
        id: "label",
        enableSorting: false,
        meta: { headerLabel: "Nhãn" },
        header: "Nhãn",
        cell: ({ row }) => row.original.label ?? "—",
      },
      {
        id: "deviceId",
        enableSorting: false,
        meta: { headerLabel: "Device ID" },
        header: "Device ID",
        cell: ({ row }) => row.original.deviceId,
      },
      {
        id: "branch",
        enableSorting: false,
        meta: { headerLabel: "Chi nhánh" },
        header: "Chi nhánh",
        cell: ({ row }) => row.original.branchId,
      },
      {
        id: "status",
        enableSorting: false,
        meta: { headerLabel: "Trạng thái" },
        header: "Trạng thái",
        cell: ({ row }) => (
          <Badge dot tone={STATUS_TONE[row.original.status]}>{STATUS_LABEL[row.original.status]}</Badge>
        ),
      },
    ],
    [],
  );

  const table = useDataTable<Device>({
    data: rows,
    columns,
    total: rows.length,
    page: 1,
    limit: rows.length || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (d) => d.id,
  });

  return (
    <PageStack>
      <Card title="Thiết bị POS" description="Danh sách thiết bị đã đăng ký. Tạm ngưng thiết bị bị mất/đánh cắp.">
        {listQuery.isLoading ? (
          <LoadingState />
        ) : listQuery.isError ? (
          <ErrorState message={toErrorMessage(listQuery.error, "Không tải được danh sách thiết bị")} />
        ) : (
          <DataTable
            table={table}
            isLoading={false}
            isError={false}
            onRowClick={(d) => setSelected(d)}
            empty="Chưa có thiết bị."
          />
        )}
      </Card>

      <DeviceDrawer device={selected} onClose={() => setSelected(null)} api={api} />
    </PageStack>
  );
};

const DeviceDrawer: React.FC<{ device: Device | null; onClose: () => void; api: ReturnType<typeof useAuth>["api"] }> = ({ device, onClose, api }) => {
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setError(null), [device]);

  const suspendMutation = useMutation({
    mutationFn: () => api.request<{ ok: true }>(`/platform/devices/${device!.deviceId}/suspend`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.devices() });
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e)),
  });

  if (!device) return <DetailDrawer open={false} title="" onClose={onClose} children={null} />;

  return (
    <DetailDrawer open title={device.label ?? device.deviceId} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
        <div>Device ID: {device.deviceId}</div>
        <div>Chi nhánh: {device.branchId}</div>
        <div>Trạng thái: {STATUS_LABEL[device.status]}</div>
        <InlineError message={error} />
        {device.status === "ACTIVE" && (
          <Button variant="danger" disabled={suspendMutation.isPending} onClick={() => suspendMutation.mutate()}>
            {suspendMutation.isPending ? "Đang tạm ngưng…" : "Tạm ngưng thiết bị"}
          </Button>
        )}
      </div>
    </DetailDrawer>
  );
};
