/**
 * OfflineReconPage — GA-02 reconciliation: review quarantined bills (mark handled)
 * and detect missing bill numbers (seq gaps). Branch-scoped + role-gated backend.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatVnd } from "@ilikebuffet/shared";
import { Button, FormField } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { usePagedList } from "../lib/use-paged-list";
import { useReport } from "../lib/use-report";
import { QUERY_KEYS } from "../lib/query-keys";
import { Card, FilterBar, DetailDrawer, Select, InlineError, LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination, Badge } from "./_shared/table";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";
import type { Branch } from "./_shared/report-ui";

const CHAIN_WIDE = new Set(["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI"]);
const today = () => new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 20;

interface QRow {
  id: string;
  number: string;
  tempNumber: string | null;
  branchId: string;
  businessDate: string;
  totalVnd: number;
  quarantineReason: string | null;
  quarantineResolvedAt: string | null;
  quarantineResolveNote: string | null;
}

export const OfflineReconPage: React.FC = () => {
  const { api, role } = useAuth();
  const isChainWide = !!role && CHAIN_WIDE.has(role);
  const branchesQuery = useQuery({ queryKey: QUERY_KEYS.branches(), enabled: isChainWide, queryFn: () => api.get<Branch[] | { data: Branch[] }>("/branches") });
  const branches = unwrapList(branchesQuery.data);

  const [resolved, setResolved] = React.useState("false");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<QRow | null>(null);

  const { rows, total, isLoading, isError, error } = usePagedList<QRow>({
    queryKey: QUERY_KEYS.quarantineReport(),
    path: "/sales/reports/quarantine",
    page,
    pageSize: PAGE_SIZE,
    filters: { resolved },
  });

  const columns = React.useMemo<ColumnDef<QRow>[]>(
    () => [
      {
        id: "number",
        enableSorting: false,
        meta: { headerLabel: "Số bill" },
        header: "Số bill",
        cell: ({ row }) => row.original.number,
      },
      {
        id: "reason",
        enableSorting: false,
        meta: { headerLabel: "Lý do cách ly" },
        header: "Lý do cách ly",
        cell: ({ row }) => row.original.quarantineReason ?? "—",
      },
      {
        id: "total",
        enableSorting: false,
        meta: { headerLabel: "Tổng", align: "right" },
        header: "Tổng",
        cell: ({ row }) => formatVnd(row.original.totalVnd),
      },
      {
        id: "status",
        enableSorting: false,
        meta: { headerLabel: "Trạng thái" },
        header: "Trạng thái",
        cell: ({ row }) => (
          <Badge tone={row.original.quarantineResolvedAt ? "success" : "warn"}>
            {row.original.quarantineResolvedAt ? "Đã xử lý" : "Chờ xử lý"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const table = useDataTable<QRow>({
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
        activePath="/reports/offline"
        pageTitle="Đối soát offline"
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
            <Select aria-label="Trạng thái xử lý" value={resolved} onChange={(e) => { setResolved(e.target.value); setPage(1); }}>
              <option value="false">Chờ xử lý</option>
              <option value="true">Đã xử lý</option>
              <option value="">Tất cả</option>
            </Select>
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
          <ErrorState message={toErrorMessage(error, "Không tải được danh sách cách ly")} />
        ) : (
          <DataTable
            table={table}
            onRowClick={(r) => setSelected(r)}
            empty="Không có bill cách ly."
          />
        )}
      </ListPageShell>

      <NumberGapsCard api={api} branches={isChainWide ? branches : undefined} />

      <QuarantineDrawer row={selected} api={api} onClose={() => setSelected(null)} />
    </>
  );
};

const QuarantineDrawer: React.FC<{ row: QRow | null; api: ReturnType<typeof useAuth>["api"]; onClose: () => void }> = ({ row, api, onClose }) => {
  const qc = useQueryClient();
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { setNote(""); setError(null); }, [row]);

  const resolveMutation = useMutation({
    mutationFn: () => api.request(`/sales/reports/quarantine/${row!.id}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.quarantineReport() });
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e)),
  });

  if (!row) return <DetailDrawer open={false} title="" onClose={onClose} children={null} />;

  return (
    <DetailDrawer open title={`Bill ${row.number}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
        <div>Lý do: {row.quarantineReason ?? "—"}</div>
        {row.tempNumber && <div>Số tạm: {row.tempNumber}</div>}
        <div>Tổng: {formatVnd(row.totalVnd)}</div>
        {row.quarantineResolvedAt ? (
          <Badge tone="success">Đã xử lý — {row.quarantineResolveNote ?? ""}</Badge>
        ) : (
          <>
            <FormField name="note" label="Ghi chú xử lý" value={note} onChange={(e) => setNote(e.target.value)} />
            <InlineError message={error} />
            <Button variant="action" disabled={resolveMutation.isPending} onClick={() => resolveMutation.mutate()}>
              {resolveMutation.isPending ? "Đang lưu…" : "Đánh dấu đã xử lý"}
            </Button>
          </>
        )}
      </div>
    </DetailDrawer>
  );
};

const NumberGapsCard: React.FC<{ api: ReturnType<typeof useAuth>["api"]; branches?: Branch[] }> = ({ branches }) => {
  const [branchId, setBranchId] = React.useState("");
  const [date, setDate] = React.useState(today());

  const { data, isLoading, isError, error } = useReport<{ min: number; max: number; missing: number[] }>({
    queryKey: QUERY_KEYS.numberGapsReport(),
    path: "/sales/reports/number-gaps",
    params: { branchId, businessDate: date },
    enabled: !!branchId && !!date,
  });

  return (
    <Card title="Lỗ hổng số bill" description="Số bill (seq) thiếu trong ngày — dấu hiệu bill bị mất/xoá.">
      <FilterBar>
        <Select aria-label="Chi nhánh" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">— Chọn chi nhánh —</option>
          {(branches ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.code}
            </option>
          ))}
        </Select>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          Ngày
          <input type="date" aria-label="Ngày" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </FilterBar>

      {!branchId ? (
        <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>Chọn chi nhánh để soát.</p>
      ) : isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={toErrorMessage(error, "Không soát được")} />
      ) : data ? (
        data.missing.length === 0 ? (
          <Badge tone="success">Không thiếu số bill nào (seq {data.min}–{data.max}).</Badge>
        ) : (
          <div>
            <Badge tone="warn">Thiếu {data.missing.length} số bill</Badge>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>Seq thiếu: {data.missing.join(", ")}</p>
          </div>
        )
      ) : null}
    </Card>
  );
};
