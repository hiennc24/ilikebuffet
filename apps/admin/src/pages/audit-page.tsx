/**
 * AuditPage — read-only audit-trail viewer (Nhật ký).
 *
 * The backend gates access (HQ + branch manager) and branch-scopes the rows; this
 * screen only reads. No mutations — the trail is append-only.
 */
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { usePagedList, buildQuery } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  DetailDrawer,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination } from "./_shared/table";
import { describeAction, describeObject, ROLE_LABELS } from "./_shared/audit-labels";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";

const PAGE_SIZE = 20;

interface AuditRow {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  branchId: string | null;
  deviceId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  approvedBy: string | null;
  createdAt: string;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "medium" });

/** "Tên user (Vai trò)" — falls back to the id, then "hệ thống" for system events. */
function describeActor(r: { actorName: string | null; actorId: string | null; actorRole: string | null }): string {
  const who = r.actorName ?? r.actorId;
  if (!who) return "hệ thống";
  const role = r.actorRole ? ROLE_LABELS[r.actorRole] ?? r.actorRole : null;
  return role ? `${who} (${role})` : who;
}

/** Object label + a short code when the id is a human code (role/branch), not a cuid. */
function describeTarget(objectType: string, objectId: string | null): string {
  const label = describeObject(objectType);
  return objectId && objectId.length <= 16 ? `${label} · ${objectId}` : label;
}

export const AuditPage: React.FC = () => {
  const { api } = useAuth();
  const [filters, setFilters] = React.useState({ action: "", objectType: "", actorId: "", from: "", to: "" });
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AuditRow | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const doExport = async () => {
    setExporting(true);
    try {
      const qs = buildQuery(filters);
      const blob = await api.download(`/audit/export${qs ? `?${qs}` : ""}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nhat-ky-${filters.from || ""}-${filters.to || ""}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const { rows, total, isLoading, isError, error } = usePagedList<AuditRow>({
    queryKey: QUERY_KEYS.audit(),
    path: "/audit",
    page,
    pageSize: PAGE_SIZE,
    filters,
  });

  const patch = (p: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
  };

  const columns = React.useMemo<ColumnDef<AuditRow>[]>(
    () => [
      {
        id: "time",
        enableSorting: false,
        meta: { headerLabel: "Thời gian" },
        header: "Thời gian",
        cell: ({ row }) => fmt(row.original.createdAt),
      },
      {
        id: "actor",
        enableSorting: false,
        meta: { headerLabel: "Người thực hiện" },
        header: "Người thực hiện",
        cell: ({ row }) => describeActor(row.original),
      },
      {
        id: "action",
        enableSorting: false,
        meta: { headerLabel: "Hành động" },
        header: "Hành động",
        cell: ({ row }) => describeAction(row.original.action),
      },
      {
        id: "object",
        enableSorting: false,
        meta: { headerLabel: "Đối tượng" },
        header: "Đối tượng",
        cell: ({ row }) => describeTarget(row.original.objectType, row.original.objectId),
      },
      {
        id: "reason",
        enableSorting: false,
        meta: { headerLabel: "Lý do" },
        header: "Lý do",
        cell: ({ row }) => row.original.reason ?? "",
      },
    ],
    [],
  );

  const table = useDataTable<AuditRow>({
    data: rows,
    columns,
    total,
    page,
    limit: PAGE_SIZE,
    sort: null,
    setPage,
    setLimit: () => {},
    setSort: () => {},
    getRowId: (r) => r.id,
  });

  return (
    <>
      <ListPageShell
        activePath="/settings/log"
        pageTitle="Nhật ký"
        actions={
          <Button variant="ghost" disabled={exporting} onClick={doExport}>
            {exporting ? "Đang xuất…" : "Xuất Excel"}
          </Button>
        }
        toolbar={
          <PageToolbar
            left={
              <PageTabs
                value="list"
                onChange={() => {}}
                items={[{ value: "list", label: "Danh sách", count: total }]}
              />
            }
          >
            <div style={filterGridStyle}>
              <label style={fieldStyle}>
                Hành động
                <input type="search" aria-label="Hành động" placeholder="vd. bill.cancel" value={filters.action} onChange={(e) => patch({ action: e.target.value })} style={inputStyle} />
              </label>
              <label style={fieldStyle}>
                Loại đối tượng
                <input type="search" aria-label="Loại đối tượng" placeholder="vd. bill" value={filters.objectType} onChange={(e) => patch({ objectType: e.target.value })} style={inputStyle} />
              </label>
              <label style={fieldStyle}>
                Người thực hiện
                <input type="search" aria-label="Người thực hiện" placeholder="ID người thực hiện" value={filters.actorId} onChange={(e) => patch({ actorId: e.target.value })} style={inputStyle} />
              </label>
              <label style={fieldStyle}>
                Từ ngày
                <input type="date" aria-label="Từ ngày" value={filters.from} onChange={(e) => patch({ from: e.target.value })} style={inputStyle} />
              </label>
              <label style={fieldStyle}>
                Đến ngày
                <input type="date" aria-label="Đến ngày" value={filters.to} onChange={(e) => patch({ to: e.target.value })} style={inputStyle} />
              </label>
            </div>
          </PageToolbar>
        }
        pagination={
          !isLoading && !isError
            ? <DataTablePagination table={table} total={total} />
            : undefined
        }
      >
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được nhật ký")} />
        ) : (
          <DataTable
            table={table}
            onRowClick={(r) => setSelected(r)}
            empty="Không có bản ghi khớp bộ lọc."
          />
        )}
      </ListPageShell>

      <DetailDrawer open={!!selected} title={selected ? `Nhật ký · ${describeAction(selected.action)}` : ""} onClose={() => setSelected(null)}>
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
            <div>Thời gian: {fmt(selected.createdAt)}</div>
            <div>Hành động: {describeAction(selected.action)}</div>
            <div>Người thực hiện: {describeActor(selected)}</div>
            <div>Đối tượng: {describeObject(selected.objectType)}{selected.objectId ? ` · ${selected.objectId}` : ""}</div>
            {selected.branchId && <div>Chi nhánh: {selected.branchId}</div>}
            {selected.reason && <div>Lý do: {selected.reason}</div>}
            {selected.approvedBy && <div>Người duyệt: {selected.approvedBy}</div>}
            {selected.before != null && <JsonBlock title="Trước" value={selected.before} />}
            {selected.after != null && <JsonBlock title="Sau" value={selected.after} />}
          </div>
        )}
      </DetailDrawer>
    </>
  );
};

const JsonBlock: React.FC<{ title: string; value: unknown }> = ({ title, value }) => (
  <section>
    <h3 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--text-muted)" }}>{title}</h3>
    <pre style={{ margin: 0, padding: "var(--space-3)", background: "var(--bg-sunken, #F1EDE7)", borderRadius: "var(--radius-md)", fontSize: "var(--text-xs)", overflowX: "auto", whiteSpace: "pre-wrap" }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  </section>
);

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "var(--input-height, 44px)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
  color: "var(--text-primary)",
  background: "var(--bg-raised, #FFFFFF)",
  // Native date pickers pick up the theme accent instead of the OS blue.
  colorScheme: "light",
  accentColor: "var(--action-bg, #235B54)",
};
// Filter fields lay out in an even auto-fit grid: 5 columns share one row on
// desktop and collapse to a single column on mobile — no lopsided 4+1 wrapping.
const filterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "var(--space-3)",
  marginBottom: "var(--space-4)",
};
// A labelled filter field: muted label above a full-width control.
const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  minWidth: 0,
  fontSize: "var(--text-xs)",
  color: "var(--text-muted)",
};
