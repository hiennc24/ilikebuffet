/**
 * SuppliersPage — master-data supplier management with the HQ approval workflow.
 *
 * Branch managers create BRANCH_SPECIFIC suppliers that start PENDING_HQ; HQ
 * approves them (PATCH …/approve) or creates CHAIN_WIDE suppliers directly. The
 * backend enforces the scope/role rules; this screen surfaces them.
 *
 * Scope note: this is the P3 slice delivered now. The remaining master-data
 * screens (ingredients + purchase units, accounts, holiday calendars, Excel
 * import) are tracked as P3b in the plan.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, FormField } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  Card,
  PageStack,
  DataTable,
  Column,
  FilterBar,
  Select,
  InlineError,
  Badge,
  BadgeTone,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";

type SupplierStatus = "ACTIVE" | "PENDING_HQ" | "INACTIVE";
type SupplierScope = "CHAIN_WIDE" | "BRANCH_SPECIFIC";

interface Supplier {
  id: string;
  name: string;
  taxCode: string | null;
  contact: string | null;
  debtTerms: number | null;
  scope: SupplierScope;
  status: SupplierStatus;
}

const STATUS_LABEL: Record<SupplierStatus, string> = {
  ACTIVE: "Đang dùng",
  PENDING_HQ: "Chờ HQ duyệt",
  INACTIVE: "Ngưng",
};
const STATUS_TONE: Record<SupplierStatus, BadgeTone> = { ACTIVE: "active", PENDING_HQ: "warn", INACTIVE: "muted" };
const SCOPE_LABEL: Record<SupplierScope, string> = { CHAIN_WIDE: "Toàn chuỗi", BRANCH_SPECIFIC: "Chi nhánh" };

type Mode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; supplier: Supplier };

export const SuppliersPage: React.FC = () => {
  const { api } = useAuth();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [mode, setMode] = React.useState<Mode>({ kind: "closed" });

  const listQuery = useQuery({
    queryKey: [...QUERY_KEYS.suppliers(), search, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const qs = params.toString();
      return api.get<Supplier[] | { data: Supplier[] }>(`/master-data/suppliers${qs ? `?${qs}` : ""}`);
    },
  });

  const rows = unwrapList(listQuery.data);

  const columns: Column<Supplier>[] = [
    { key: "name", header: "Tên", render: (s) => s.name },
    { key: "tax", header: "MST", render: (s) => s.taxCode ?? "—" },
    { key: "contact", header: "Liên hệ", render: (s) => s.contact ?? "—" },
    { key: "scope", header: "Phạm vi", render: (s) => <Badge tone="neutral">{SCOPE_LABEL[s.scope]}</Badge> },
    { key: "status", header: "Trạng thái", render: (s) => <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge> },
  ];

  return (
    <PageStack>
      <Card
        title="Nhà cung cấp"
        description="Quản lý NCC. NCC theo chi nhánh chờ HQ duyệt trước khi dùng."
        actions={
          <Button variant="action" onClick={() => setMode({ kind: "create" })}>
            NCC mới
          </Button>
        }
      >
        <FilterBar>
          <input type="search" aria-label="Tìm NCC" placeholder="Tìm theo tên…" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
          <Select aria-label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang dùng</option>
            <option value="PENDING_HQ">Chờ HQ duyệt</option>
            <option value="INACTIVE">Ngưng</option>
          </Select>
        </FilterBar>

        {listQuery.isLoading ? (
          <LoadingState />
        ) : listQuery.isError ? (
          <ErrorState message={toErrorMessage(listQuery.error, "Không tải được danh sách NCC")} />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} onRowClick={(s) => setMode({ kind: "edit", supplier: s })} emptyText="Chưa có nhà cung cấp." />
        )}
      </Card>

      {mode.kind !== "closed" && <SupplierDialog mode={mode} onClose={() => setMode({ kind: "closed" })} api={api} />}
    </PageStack>
  );
};

// ── Create / edit / approve dialog ──────────────────────────────────────────

interface SupplierDialogProps {
  mode: Exclude<Mode, { kind: "closed" }>;
  onClose: () => void;
  api: ReturnType<typeof useAuth>["api"];
}

const SupplierDialog: React.FC<SupplierDialogProps> = ({ mode, onClose, api }) => {
  const qc = useQueryClient();
  const { selectedBranchId } = useAuth();
  const editing = mode.kind === "edit" ? mode.supplier : null;

  const [form, setForm] = React.useState({
    name: editing?.name ?? "",
    taxCode: editing?.taxCode ?? "",
    contact: editing?.contact ?? "",
    debtTerms: editing?.debtTerms != null ? String(editing.debtTerms) : "",
  });
  const [scope, setScope] = React.useState<SupplierScope>(editing?.scope ?? "CHAIN_WIDE");
  const [formError, setFormError] = React.useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const invalidate = () => void qc.invalidateQueries({ queryKey: QUERY_KEYS.suppliers() });

  const payload = () => ({
    name: form.name,
    taxCode: form.taxCode || undefined,
    contact: form.contact || undefined,
    debtTerms: form.debtTerms ? Number.parseInt(form.debtTerms, 10) : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? api.request<Supplier>(`/master-data/suppliers/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload()),
          })
        : api.post<Supplier>("/master-data/suppliers", {
            ...payload(),
            scope,
            branchId: scope === "BRANCH_SPECIFIC" ? selectedBranchId ?? undefined : undefined,
          }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => setFormError(toErrorMessage(e)),
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      api.request<Supplier>(`/master-data/suppliers/${editing!.id}/approve`, { method: "PATCH" }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => setFormError(toErrorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setFormError("Nhập tên nhà cung cấp");
    if (form.debtTerms && !Number.isInteger(Number(form.debtTerms))) return setFormError("Công nợ (ngày) phải là số nguyên");
    setFormError(null);
    saveMutation.mutate();
  };

  return (
    <Dialog open title={editing ? `Sửa NCC ${editing.name}` : "Nhà cung cấp mới"} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <FormField name="name" label="Tên *" value={form.name} onChange={set("name")} placeholder="Tên nhà cung cấp" />
        <FormField name="taxCode" label="Mã số thuế" value={form.taxCode} onChange={set("taxCode")} />
        <FormField name="contact" label="Liên hệ" value={form.contact} onChange={set("contact")} placeholder="SĐT / email" />
        <FormField name="debtTerms" label="Công nợ (ngày)" type="number" value={form.debtTerms} onChange={set("debtTerms")} />

        {!editing && (
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Phạm vi
            <Select aria-label="Phạm vi" value={scope} onChange={(e) => setScope(e.target.value as SupplierScope)}>
              <option value="CHAIN_WIDE">Toàn chuỗi (HQ)</option>
              <option value="BRANCH_SPECIFIC">Chi nhánh (chờ HQ duyệt)</option>
            </Select>
          </label>
        )}

        <InlineError message={formError} />

        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
          {editing?.status === "PENDING_HQ" ? (
            <Button type="button" variant="action" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
              {approveMutation.isPending ? "Đang duyệt…" : "Duyệt (HQ)"}
            </Button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button type="button" variant="ghost" onClick={onClose}>
              Đóng
            </Button>
            <Button type="submit" variant="action" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        </div>
      </form>
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
