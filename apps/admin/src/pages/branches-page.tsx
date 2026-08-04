/**
 * BranchesPage — admin branch management (list, create, edit, status).
 *
 * Backend enforces QUAN_TRI_HQ for create/update/status (403 otherwise); this
 * screen surfaces those controls and the server stays the gate. Branches are few,
 * so the list is unpaginated (search + status filter only).
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Button, Dialog, FormField } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  Card,
  PageStack,
  FilterBar,
  Select,
  InlineError,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import { DataTable, useDataTable, Badge } from "./_shared/table";
import type { BadgeTone } from "./_shared/table";

type BranchStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

interface Branch {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  status: BranchStatus;
  poApprovalThresholdVnd?: number;
}

const STATUS_LABEL: Record<BranchStatus, string> = {
  ACTIVE: "Đang hoạt động",
  SUSPENDED: "Tạm ngưng",
  CLOSED: "Đã đóng",
};
const STATUS_TONE: Record<BranchStatus, BadgeTone> = {
  ACTIVE: "success",
  SUSPENDED: "warn",
  CLOSED: "neutral",
};

type Mode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; branch: Branch };

export const BranchesPage: React.FC = () => {
  const { api } = useAuth();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [mode, setMode] = React.useState<Mode>({ kind: "closed" });

  const listQuery = useQuery({
    queryKey: [...QUERY_KEYS.branches(), search, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const qs = params.toString();
      return api.get<Branch[] | { data: Branch[] }>(`/branches${qs ? `?${qs}` : ""}`);
    },
  });

  const rows = unwrapList(listQuery.data);

  const columns = React.useMemo<ColumnDef<Branch>[]>(
    () => [
      {
        id: "code",
        enableSorting: false,
        meta: { headerLabel: "Mã", width: "80px" },
        header: "Mã",
        cell: ({ row }) => row.original.code,
      },
      {
        id: "name",
        enableSorting: false,
        meta: { headerLabel: "Tên" },
        header: "Tên",
        cell: ({ row }) => row.original.name,
      },
      {
        id: "address",
        enableSorting: false,
        meta: { headerLabel: "Địa chỉ" },
        header: "Địa chỉ",
        cell: ({ row }) => row.original.address,
      },
      {
        id: "phone",
        enableSorting: false,
        meta: { headerLabel: "SĐT" },
        header: "SĐT",
        cell: ({ row }) => row.original.phone,
      },
      {
        id: "status",
        enableSorting: false,
        meta: { headerLabel: "Trạng thái" },
        header: "Trạng thái",
        cell: ({ row }) => {
          const b = row.original;
          return <Badge dot tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>;
        },
      },
    ],
    [],
  );

  const table = useDataTable<Branch>({
    data: rows,
    columns,
    total: rows.length,
    page: 1,
    limit: rows.length || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (b) => b.id,
  });

  return (
    <PageStack>
      <Card
        title="Chi nhánh"
        description="Quản lý chi nhánh trong chuỗi."
        actions={
          <Button variant="action" onClick={() => setMode({ kind: "create" })}>
            Chi nhánh mới
          </Button>
        }
      >
        <FilterBar>
          <input
            type="search"
            aria-label="Tìm chi nhánh"
            placeholder="Tìm theo mã/tên…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />
          <Select aria-label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="SUSPENDED">Tạm ngưng</option>
            <option value="CLOSED">Đã đóng</option>
          </Select>
        </FilterBar>

        {listQuery.isLoading ? (
          <LoadingState />
        ) : listQuery.isError ? (
          <ErrorState message={toErrorMessage(listQuery.error, "Không tải được danh sách chi nhánh")} />
        ) : (
          <DataTable
            table={table}
            isLoading={false}
            isError={false}
            onRowClick={(b) => setMode({ kind: "edit", branch: b })}
            empty="Chưa có chi nhánh."
          />
        )}
      </Card>

      {mode.kind !== "closed" && (
        <BranchDialog mode={mode} onClose={() => setMode({ kind: "closed" })} api={api} />
      )}
    </PageStack>
  );
};

// ── Create / edit dialog ────────────────────────────────────────────────────

interface BranchDialogProps {
  mode: Exclude<Mode, { kind: "closed" }>;
  onClose: () => void;
  api: ReturnType<typeof useAuth>["api"];
}

const BranchDialog: React.FC<BranchDialogProps> = ({ mode, onClose, api }) => {
  const qc = useQueryClient();
  const editing = mode.kind === "edit" ? mode.branch : null;

  const [form, setForm] = React.useState({
    code: editing?.code ?? "",
    name: editing?.name ?? "",
    address: editing?.address ?? "",
    phone: editing?.phone ?? "",
    poApprovalThresholdVnd: String(editing?.poApprovalThresholdVnd ?? 0),
  });
  const [status, setStatus] = React.useState<BranchStatus>(editing?.status ?? "ACTIVE");
  const [statusReason, setStatusReason] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const invalidate = () => void qc.invalidateQueries({ queryKey: QUERY_KEYS.branches() });

  const payload = () => ({
    ...form,
    poApprovalThresholdVnd: Number.parseInt(form.poApprovalThresholdVnd, 10) || 0,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? api.request<Branch>(`/branches/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload()),
          })
        : api.post<Branch>("/branches", payload()),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => setFormError(toErrorMessage(e)),
  });

  const statusMutation = useMutation({
    mutationFn: () =>
      api.request<Branch>(`/branches/${editing!.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason: statusReason || undefined }),
      }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => setFormError(toErrorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim() || !form.address.trim() || !form.phone.trim()) {
      return setFormError("Nhập đủ mã, tên, địa chỉ, SĐT");
    }
    setFormError(null);
    saveMutation.mutate();
  };

  return (
    <Dialog open title={editing ? `Sửa chi nhánh ${editing.code}` : "Chi nhánh mới"} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <FormField name="code" label="Mã *" value={form.code} onChange={set("code")} placeholder="VD: CN01" />
        <FormField name="name" label="Tên *" value={form.name} onChange={set("name")} placeholder="VD: Chi nhánh Quận 1" />
        <FormField name="address" label="Địa chỉ *" value={form.address} onChange={set("address")} placeholder="Số nhà, đường…" />
        <FormField name="phone" label="SĐT *" value={form.phone} onChange={set("phone")} placeholder="0900…" />
        <FormField
          name="poApprovalThresholdVnd"
          label="Ngưỡng duyệt đơn mua (VND)"
          type="number"
          value={form.poApprovalThresholdVnd}
          onChange={set("poApprovalThresholdVnd")}
          placeholder="0 = mọi đơn cần duyệt"
        />

        <InlineError message={formError} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button type="submit" variant="action" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      </form>

      {editing && (
        <div style={{ marginTop: "var(--space-5)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <h3 style={{ margin: 0, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--text-muted)" }}>
            Trạng thái
          </h3>
          <Select aria-label="Đổi trạng thái" value={status} onChange={(e) => setStatus(e.target.value as BranchStatus)}>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="SUSPENDED">Tạm ngưng</option>
            <option value="CLOSED">Đã đóng</option>
          </Select>
          <FormField name="statusReason" label="Lý do (tuỳ chọn)" value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
          <Button
            type="button"
            variant="ghost"
            disabled={status === editing.status || statusMutation.isPending}
            onClick={() => statusMutation.mutate()}
          >
            Cập nhật trạng thái
          </Button>
        </div>
      )}
    </Dialog>
  );
};

const inputStyle: React.CSSProperties = {
  height: "var(--input-height, 44px)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
};
