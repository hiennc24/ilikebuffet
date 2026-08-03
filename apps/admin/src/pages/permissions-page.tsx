/**
 * PermissionsPage — read-only view of the role→capability matrix (Vai trò & phân
 * quyền). The matrix is defined in the backend code (permissions.ts); this screen
 * only displays it via GET /rbac/capabilities so admins can see what each role can
 * do. There is no edit — capabilities are a code-level config.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/auth-context";
import { QUERY_KEYS } from "../lib/query-keys";
import { Card, PageStack, DataTable, Column, LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";

interface CapabilitiesResponse {
  roles: { value: string; label: string }[];
  capabilities: string[];
  matrix: Record<string, string[]>;
}
interface CapRow {
  capability: string;
}

export const PermissionsPage: React.FC = () => {
  const { api } = useAuth();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEYS.rbacCapabilities(),
    queryFn: () => api.get<CapabilitiesResponse>("/rbac/capabilities"),
  });

  const columns: Column<CapRow>[] = React.useMemo(() => {
    if (!data) return [];
    const has = (role: string, cap: string) => (data.matrix[role] ?? []).includes(cap);
    return [
      { key: "capability", header: "Quyền (capability)", render: (r) => <code style={{ fontSize: "var(--text-xs)" }}>{r.capability}</code> },
      ...data.roles.map<Column<CapRow>>((role) => ({
        key: role.value,
        header: role.label,
        align: "center",
        render: (r) =>
          has(role.value, r.capability) ? (
            <span aria-label={`${role.label} có ${r.capability}`} style={{ color: "var(--color-success, #2e7d32)", fontWeight: 600 }}>✓</span>
          ) : (
            <span aria-label={`${role.label} không có ${r.capability}`} style={{ color: "var(--text-muted)" }}>–</span>
          ),
      })),
    ];
  }, [data]);

  const rows: CapRow[] = (data?.capabilities ?? []).map((capability) => ({ capability }));

  return (
    <PageStack>
      <Card
        title="Vai trò & phân quyền"
        description="Ma trận quyền theo vai trò (chỉ đọc). Cấu hình ở hệ thống (mã nguồn); màn này chỉ hiển thị."
      >
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được ma trận phân quyền")} />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.capability} emptyText="Không có quyền nào." />
        )}
      </Card>
    </PageStack>
  );
};
