/**
 * AuditPage — read-only audit-trail viewer (Nhật ký).
 *
 * The backend gates access (HQ + branch manager) and branch-scopes the rows; this
 * screen only reads. No mutations — the trail is append-only.
 */
import * as React from "react";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { usePagedList, buildQuery } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  Card,
  PageStack,
  DataTable,
  Column,
  Pagination,
  DetailDrawer,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import { describeAction, describeObject, ROLE_LABELS } from "./_shared/audit-labels";

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

  const { rows, total, pageCount, isLoading, isError, error } = usePagedList<AuditRow>({
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

  const columns: Column<AuditRow>[] = [
    { key: "time", header: "Thời gian", render: (r) => fmt(r.createdAt) },
    { key: "actor", header: "Người thực hiện", render: (r) => describeActor(r) },
    { key: "action", header: "Hành động", render: (r) => describeAction(r.action) },
    { key: "object", header: "Đối tượng", render: (r) => describeTarget(r.objectType, r.objectId) },
    { key: "reason", header: "Lý do", render: (r) => r.reason ?? "" },
  ];

  return (
    <PageStack>
      <Card
        title="Nhật ký"
        description="Lịch sử thao tác (chỉ đọc, không thể sửa/xoá)."
        actions={
          <Button variant="ghost" disabled={exporting} onClick={doExport}>
            {exporting ? "Đang xuất…" : "Xuất Excel"}
          </Button>
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

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được nhật ký")} />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => setSelected(r)} emptyText="Không có bản ghi khớp bộ lọc." />
            <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

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
    </PageStack>
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
