/**
 * AccountsPage — accounting accounts + groups (P3d, closes M2 master-data).
 *
 * HQ-only. Accounts have a Thu/Chi flow and an optional integer-VND approval
 * threshold (money rule: no floats).
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatVnd } from "@ilikebuffet/shared";
import { Button, Dialog, FormField } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  Card,
  Select,
  InlineError,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination, Badge } from "./_shared/table";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";

type Flow = "INCOME" | "EXPENSE";
interface AccountGroup {
  id: string;
  name: string;
}
interface Account {
  id: string;
  name: string;
  groupId: string;
  flow: Flow;
  approvalThresholdVnd: number;
  group?: { name: string };
}
const FLOW_LABEL: Record<Flow, string> = { INCOME: "Thu", EXPENSE: "Chi" };

export const AccountsPage: React.FC = () => {
  const { api } = useAuth();
  const [flow, setFlow] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<{ mode: "create" } | { mode: "edit"; account: Account } | null>(null);

  const groups = useQuery({ queryKey: QUERY_KEYS.accountGroups(), queryFn: () => api.get<AccountGroup[] | { data: AccountGroup[] }>("/master-data/accounts/groups") });
  const groupList = unwrapList(groups.data);

  const accountsQuery = useQuery({
    queryKey: [...QUERY_KEYS.accounts(), flow, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (flow) params.set("flow", flow);
      if (search) params.set("search", search);
      const qs = params.toString();
      return api.get<{ data: Account[] } | Account[]>(`/master-data/accounts${qs ? `?${qs}` : ""}`);
    },
  });
  const rows = unwrapList(accountsQuery.data);

  const columns = React.useMemo<ColumnDef<Account>[]>(
    () => [
      {
        id: "name",
        enableSorting: false,
        meta: { headerLabel: "Tên" },
        header: "Tên",
        cell: ({ row }) => row.original.name,
      },
      {
        id: "group",
        enableSorting: false,
        meta: { headerLabel: "Nhóm" },
        header: "Nhóm",
        cell: ({ row }) => row.original.group?.name ?? "—",
      },
      {
        id: "flow",
        enableSorting: false,
        meta: { headerLabel: "Loại", width: "100px" },
        header: "Loại",
        cell: ({ row }) => (
          <Badge tone={row.original.flow === "INCOME" ? "success" : "warn"}>
            {FLOW_LABEL[row.original.flow]}
          </Badge>
        ),
      },
      {
        id: "threshold",
        enableSorting: false,
        meta: { headerLabel: "Ngưỡng duyệt", align: "right" },
        header: "Ngưỡng duyệt",
        cell: ({ row }) =>
          row.original.approvalThresholdVnd > 0 ? formatVnd(row.original.approvalThresholdVnd) : "—",
      },
    ],
    [],
  );

  const table = useDataTable<Account>({
    data: rows,
    columns,
    total: rows.length,
    page: 1,
    limit: rows.length || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (a) => a.id,
  });

  return (
    <>
      <ListPageShell
        activePath="/master-data/accounts"
        pageTitle="Tài khoản kế toán"
        actions={
          <Button variant="action" disabled={groupList.length === 0} onClick={() => setDialog({ mode: "create" })}>
            Tài khoản mới
          </Button>
        }
        toolbar={
          <PageToolbar
            left={
              <PageTabs
                value="list"
                onChange={() => {}}
                items={[{ value: "list", label: "Danh sách", count: rows.length }]}
              />
            }
          >
            <input
              type="search"
              aria-label="Tìm tài khoản"
              placeholder="Tìm tên…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={inputStyle}
            />
            <Select aria-label="Loại" value={flow} onChange={(e) => setFlow(e.target.value)}>
              <option value="">Tất cả</option>
              <option value="INCOME">Thu</option>
              <option value="EXPENSE">Chi</option>
            </Select>
          </PageToolbar>
        }
        pagination={
          !accountsQuery.isLoading && !accountsQuery.isError
            ? <DataTablePagination table={table} total={rows.length} />
            : undefined
        }
      >
        {accountsQuery.isLoading ? (
          <div style={{ padding: "var(--space-5)" }}>
            <LoadingState />
          </div>
        ) : accountsQuery.isError ? (
          <div style={{ padding: "var(--space-5)" }}>
            <ErrorState message={toErrorMessage(accountsQuery.error, "Không tải được tài khoản")} />
          </div>
        ) : (
          <DataTable
            table={table}
            onRowClick={(a) => setDialog({ mode: "edit", account: a })}
            empty="Chưa có tài khoản."
          />
        )}
      </ListPageShell>

      <AccountGroupsCard groups={groupList} api={api} />

      {dialog && <AccountDialog dialog={dialog} groups={groupList} api={api} onClose={() => setDialog(null)} />}
    </>
  );
};

const AccountGroupsCard: React.FC<{ groups: AccountGroup[]; api: ReturnType<typeof useAuth>["api"] }> = ({ groups, api }) => {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => api.post("/master-data/accounts/groups", { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.accountGroups() });
      setName("");
      setError(null);
    },
    onError: (e) => setError(toErrorMessage(e)),
  });
  return (
    <Card title="Nhóm tài khoản">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <input aria-label="Tên nhóm tài khoản" placeholder="Tên nhóm" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          <Button variant="action" disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            Thêm
          </Button>
        </div>
        <InlineError message={error} />
        <ul style={{ margin: 0, paddingLeft: "var(--space-4)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
          {groups.map((g) => (
            <li key={g.id}>{g.name}</li>
          ))}
          {groups.length === 0 && <li style={{ listStyle: "none", color: "var(--text-muted)" }}>Chưa có nhóm.</li>}
        </ul>
      </div>
    </Card>
  );
};

const AccountDialog: React.FC<{
  dialog: { mode: "create" } | { mode: "edit"; account: Account };
  groups: AccountGroup[];
  api: ReturnType<typeof useAuth>["api"];
  onClose: () => void;
}> = ({ dialog, groups, api, onClose }) => {
  const qc = useQueryClient();
  const editing = dialog.mode === "edit" ? dialog.account : null;
  const [name, setName] = React.useState(editing?.name ?? "");
  const [groupId, setGroupId] = React.useState(editing?.groupId ?? groups[0]?.id ?? "");
  const [flow, setFlow] = React.useState<Flow>(editing?.flow ?? "EXPENSE");
  const [threshold, setThreshold] = React.useState(editing ? String(editing.approvalThresholdVnd) : "0");
  const [error, setError] = React.useState<string | null>(null);

  const body = () => ({ name, groupId, flow, approvalThresholdVnd: Number.parseInt(threshold || "0", 10) });

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? api.request(`/master-data/accounts/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, flow, approvalThresholdVnd: Number.parseInt(threshold || "0", 10) }) })
        : api.post("/master-data/accounts", body()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.accounts() });
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Nhập tên tài khoản");
    if (!editing && !groupId) return setError("Chọn nhóm");
    const t = Number.parseInt(threshold || "0", 10);
    if (!Number.isInteger(t) || t < 0) return setError("Ngưỡng duyệt phải là số nguyên VND ≥ 0");
    setError(null);
    saveMutation.mutate();
  };

  return (
    <Dialog open title={editing ? `Sửa ${editing.name}` : "Tài khoản mới"} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <FormField name="name" label="Tên *" value={name} onChange={(e) => setName(e.target.value)} />
        {!editing && (
          <label style={labelStyle}>
            Nhóm *
            <Select aria-label="Nhóm" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label style={labelStyle}>
          Loại
          <Select aria-label="Loại" value={flow} onChange={(e) => setFlow(e.target.value as Flow)}>
            <option value="INCOME">Thu</option>
            <option value="EXPENSE">Chi</option>
          </Select>
        </label>
        <FormField name="threshold" label="Ngưỡng duyệt (VND, 0 = không)" type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        <InlineError message={error} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button type="submit" variant="action" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

const inputStyle: React.CSSProperties = {
  height: "40px",
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
};
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" };
