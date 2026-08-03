/**
 * PermissionsPage — role management with grouped permission tree (Vai trò & phân quyền).
 *
 * Supports: list roles (DataTable), create custom role (Dialog with grouped capability
 * checkboxes), edit name/description/capabilities of existing roles, delete custom roles.
 * System roles (isSystem=true) show a "Hệ thống" badge and cannot be deleted.
 *
 * Backend:
 *   GET  /rbac/capabilities  → { groups: [{ key, label, actions: [{ key, label }] }] }
 *   GET  /rbac/roles          → { data: [Role] }
 *   POST /rbac/roles          body { code, name, description?, capabilities[] }
 *   PUT  /rbac/roles/:code    body { name?, description? }
 *   PUT  /rbac/roles/:code/capabilities  body { capabilities[] }
 *   DELETE /rbac/roles/:code
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, FormField } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  Card,
  PageStack,
  DataTable,
  Column,
  Badge,
  InlineError,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CapAction {
  key: string;
  label: string;
}
interface CapGroup {
  key: string;
  label: string;
  actions: CapAction[];
}
interface CapabilitiesResponse {
  groups: CapGroup[];
}

interface Role {
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  capabilities: string[];
  userCount: number;
}
interface RolesResponse {
  data: Role[];
}

type Mode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; role: Role };

// ── Page ──────────────────────────────────────────────────────────────────────

export const PermissionsPage: React.FC = () => {
  const { api } = useAuth();
  const [mode, setMode] = React.useState<Mode>({ kind: "closed" });

  const rolesQuery = useQuery({
    queryKey: QUERY_KEYS.roles(),
    queryFn: () => api.get<RolesResponse>("/rbac/roles"),
  });

  const roles: Role[] = rolesQuery.data?.data ?? [];

  const columns: Column<Role>[] = [
    { key: "name", header: "Tên", render: (r) => r.name },
    { key: "code", header: "Mã", render: (r) => <code style={{ fontSize: "var(--text-xs)" }}>{r.code}</code> },
    {
      key: "type",
      header: "Loại",
      render: (r) =>
        r.isSystem ? (
          <Badge tone="active">Hệ thống</Badge>
        ) : (
          <Badge tone="neutral">Tuỳ chỉnh</Badge>
        ),
    },
    { key: "userCount", header: "Số người dùng", align: "right", render: (r) => String(r.userCount) },
    { key: "capCount", header: "Số quyền", align: "right", render: (r) => String(r.capabilities.length) },
  ];

  return (
    <PageStack>
      <Card
        title="Vai trò & phân quyền"
        description="Quản lý vai trò và quyền hạn trong hệ thống."
        actions={
          <Button variant="action" onClick={() => setMode({ kind: "create" })}>
            Vai trò mới
          </Button>
        }
      >
        {rolesQuery.isLoading ? (
          <LoadingState />
        ) : rolesQuery.isError ? (
          <ErrorState message={toErrorMessage(rolesQuery.error, "Không tải được danh sách vai trò")} />
        ) : (
          <DataTable
            columns={columns}
            rows={roles}
            rowKey={(r) => r.code}
            onRowClick={(r) => setMode({ kind: "edit", role: r })}
            emptyText="Chưa có vai trò nào."
          />
        )}
      </Card>

      {mode.kind !== "closed" && (
        <RoleDialog mode={mode} onClose={() => setMode({ kind: "closed" })} api={api} />
      )}
    </PageStack>
  );
};

// ── Role Dialog (create / edit) ───────────────────────────────────────────────

interface RoleDialogProps {
  mode: Exclude<Mode, { kind: "closed" }>;
  onClose: () => void;
  api: ReturnType<typeof useAuth>["api"];
}

const RoleDialog: React.FC<RoleDialogProps> = ({ mode, onClose, api }) => {
  const qc = useQueryClient();
  const editing = mode.kind === "edit" ? mode.role : null;

  const capQuery = useQuery({
    queryKey: QUERY_KEYS.rbacCapabilities(),
    queryFn: () => api.get<CapabilitiesResponse>("/rbac/capabilities"),
  });
  const groups: CapGroup[] = capQuery.data?.groups ?? [];

  const [code, setCode] = React.useState(editing?.code ?? "");
  const [name, setName] = React.useState(editing?.name ?? "");
  const [description, setDescription] = React.useState(editing?.description ?? "");
  const [selected, setSelected] = React.useState<Set<string>>(new Set(editing?.capabilities ?? []));
  const [formError, setFormError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const invalidate = () => void qc.invalidateQueries({ queryKey: QUERY_KEYS.roles() });

  // ── Capability toggle helpers ──────────────────────────────────────────────

  const toggleAction = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (group: CapGroup) => {
    const allKeys = group.actions.map((a) => a.key);
    const allSelected = allKeys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allKeys.forEach((k) => next.delete(k));
      } else {
        allKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const groupChecked = (group: CapGroup): boolean =>
    group.actions.length > 0 && group.actions.every((a) => selected.has(a.key));
  const groupIndeterminate = (group: CapGroup): boolean =>
    !groupChecked(group) && group.actions.some((a) => selected.has(a.key));

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      const caps = Array.from(selected);
      if (editing) {
        // Two concurrent PUT calls for edit.
        await api.request<Role>(`/rbac/roles/${editing.code}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
        });
        await api.request<unknown>(`/rbac/roles/${editing.code}/capabilities`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ capabilities: caps }),
        });
      } else {
        await api.post<Role>("/rbac/roles", {
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
          capabilities: caps,
        });
      }
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => setFormError(toErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      api.request<unknown>(`/rbac/roles/${editing!.code}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => {
      setConfirmDelete(false);
      setFormError(toErrorMessage(e));
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && !/^[A-Z][A-Z0-9_]{1,39}$/.test(code.trim())) {
      return setFormError("Mã vai trò phải bắt đầu bằng chữ hoa, chỉ chứa A-Z 0-9 _ (tối đa 40 ký tự)");
    }
    if (!name.trim()) return setFormError("Nhập tên vai trò");
    setFormError(null);
    saveMutation.mutate();
  };

  const canDelete = !!editing && !editing.isSystem && editing.userCount === 0;

  const title = editing ? `Vai trò ${editing.code}` : "Vai trò mới";

  return (
    <Dialog open title={title} onClose={onClose}>
      {confirmDelete ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
          <p style={{ margin: 0 }}>Xoá vai trò <strong>{editing?.code}</strong>? Hành động này không thể hoàn tác.</p>
          <InlineError message={formError} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Huỷ
            </Button>
            <Button type="button" variant="danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? "Đang xoá…" : "Xoá vai trò"}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                Mã
              </label>
              <code style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "var(--text-sm)", padding: "var(--space-2) var(--space-3)", background: "var(--bg-sunken, #F1EDE7)", borderRadius: "var(--radius-md)" }}>
                {editing.code}
              </code>
            </div>
          ) : (
            <FormField
              name="code"
              label="Mã *"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="VD: KY_THUAT"
            />
          )}
          <FormField
            name="name"
            label="Tên *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Kỹ thuật"
          />
          <FormField
            name="description"
            label="Mô tả"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tuỳ chọn"
          />

          {/* Grouped permission tree */}
          {capQuery.isLoading ? (
            <LoadingState text="Đang tải danh sách quyền…" />
          ) : capQuery.isError ? (
            <ErrorState message={toErrorMessage(capQuery.error, "Không tải được danh sách quyền")} />
          ) : (
            <fieldset style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <legend style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "0 var(--space-1)" }}>
                Quyền hạn
              </legend>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxHeight: "360px", overflowY: "auto" }}>
                {groups.map((group) => {
                  const checked = groupChecked(group);
                  const indeterminate = groupIndeterminate(group);
                  return (
                    <div key={group.key}>
                      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"], cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          ref={(el) => { if (el) el.indeterminate = indeterminate; }}
                          onChange={() => toggleGroup(group)}
                          aria-label={`Chọn tất cả nhóm ${group.label}`}
                        />
                        {group.label}
                      </label>
                      <div style={{ marginLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "2px", marginTop: "var(--space-1)" }}>
                        {group.actions.map((action) => (
                          <label
                            key={action.key}
                            style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", cursor: "pointer" }}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(action.key)}
                              onChange={() => toggleAction(action.key)}
                              aria-label={action.label}
                            />
                            {action.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          )}

          <InlineError message={formError} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
            <div>
              {canDelete && (
                <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
                  Xoá vai trò
                </Button>
              )}
              {editing && !editing.isSystem && editing.userCount > 0 && (
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  Không thể xoá — đang có {editing.userCount} người dùng
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Button type="button" variant="ghost" onClick={onClose}>
                Đóng
              </Button>
              <Button type="submit" variant="action" disabled={saveMutation.isPending || !!editing?.isSystem}>
                {saveMutation.isPending ? "Đang lưu…" : "Lưu"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Dialog>
  );
};
