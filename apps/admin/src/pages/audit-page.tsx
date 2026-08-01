/**
 * AuditPage — read-only audit-trail viewer (Nhật ký).
 *
 * The backend gates access (HQ + branch manager) and branch-scopes the rows; this
 * screen only reads. No mutations — the trail is append-only.
 */
import * as React from "react";
import { usePagedList } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  Card,
  PageStack,
  DataTable,
  Column,
  FilterBar,
  Pagination,
  DetailDrawer,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";

const PAGE_SIZE = 20;

interface AuditRow {
  id: string;
  actorId: string | null;
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

export const AuditPage: React.FC = () => {
  const [filters, setFilters] = React.useState({ action: "", objectType: "", actorId: "", from: "", to: "" });
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AuditRow | null>(null);

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
    { key: "actor", header: "Người thực hiện", render: (r) => (r.actorRole ? `${r.actorId ?? "—"} (${r.actorRole})` : r.actorId ?? "hệ thống") },
    { key: "action", header: "Hành động", render: (r) => r.action },
    { key: "object", header: "Đối tượng", render: (r) => `${r.objectType}${r.objectId ? `:${r.objectId}` : ""}` },
    { key: "reason", header: "Lý do", render: (r) => r.reason ?? "" },
  ];

  return (
    <PageStack>
      <Card title="Nhật ký" description="Lịch sử thao tác (chỉ đọc, không thể sửa/xoá).">
        <FilterBar>
          <input type="search" aria-label="Hành động" placeholder="Hành động (vd bill.cancel)…" value={filters.action} onChange={(e) => patch({ action: e.target.value })} style={inputStyle} />
          <input type="search" aria-label="Loại đối tượng" placeholder="Loại đối tượng…" value={filters.objectType} onChange={(e) => patch({ objectType: e.target.value })} style={inputStyle} />
          <input type="search" aria-label="Người thực hiện" placeholder="ID người thực hiện…" value={filters.actorId} onChange={(e) => patch({ actorId: e.target.value })} style={inputStyle} />
          <label style={labelStyle}>
            Từ
            <input type="date" aria-label="Từ ngày" value={filters.from} onChange={(e) => patch({ from: e.target.value })} />
          </label>
          <label style={labelStyle}>
            Đến
            <input type="date" aria-label="Đến ngày" value={filters.to} onChange={(e) => patch({ to: e.target.value })} />
          </label>
        </FilterBar>

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

      <DetailDrawer open={!!selected} title={selected ? `Nhật ký ${selected.action}` : ""} onClose={() => setSelected(null)}>
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
            <div>Thời gian: {fmt(selected.createdAt)}</div>
            <div>Người thực hiện: {selected.actorId ?? "hệ thống"} {selected.actorRole ? `(${selected.actorRole})` : ""}</div>
            <div>Đối tượng: {selected.objectType}{selected.objectId ? `:${selected.objectId}` : ""}</div>
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
  height: "var(--input-height, 44px)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
};
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" };
