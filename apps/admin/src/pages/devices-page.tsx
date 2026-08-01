/**
 * DevicesPage — POS device registry (list + suspend). Branch-scoped by the
 * backend; HQ + branch managers only. The one-time device secret is issued at
 * registration on the POS side and is never shown here.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  Card,
  PageStack,
  DataTable,
  Column,
  DetailDrawer,
  Badge,
  BadgeTone,
  InlineError,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";

type DeviceStatus = "ACTIVE" | "SUSPENDED";
interface Device {
  id: string;
  deviceId: string;
  branchId: string;
  label: string | null;
  status: DeviceStatus;
  createdAt: string;
}
const STATUS_TONE: Record<DeviceStatus, BadgeTone> = { ACTIVE: "active", SUSPENDED: "warn" };
const STATUS_LABEL: Record<DeviceStatus, string> = { ACTIVE: "Hoạt động", SUSPENDED: "Tạm ngưng" };

export const DevicesPage: React.FC = () => {
  const { api } = useAuth();
  const [selected, setSelected] = React.useState<Device | null>(null);

  const listQuery = useQuery({
    queryKey: QUERY_KEYS.devices(),
    queryFn: () => api.get<Device[] | { data: Device[] }>("/platform/devices"),
  });
  const rows = unwrapList(listQuery.data);

  const columns: Column<Device>[] = [
    { key: "label", header: "Nhãn", render: (d) => d.label ?? "—" },
    { key: "deviceId", header: "Device ID", render: (d) => d.deviceId },
    { key: "branch", header: "Chi nhánh", render: (d) => d.branchId },
    { key: "status", header: "Trạng thái", render: (d) => <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge> },
  ];

  return (
    <PageStack>
      <Card title="Thiết bị POS" description="Danh sách thiết bị đã đăng ký. Tạm ngưng thiết bị bị mất/đánh cắp.">
        {listQuery.isLoading ? (
          <LoadingState />
        ) : listQuery.isError ? (
          <ErrorState message={toErrorMessage(listQuery.error, "Không tải được danh sách thiết bị")} />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(d) => d.id} onRowClick={(d) => setSelected(d)} emptyText="Chưa có thiết bị." />
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
