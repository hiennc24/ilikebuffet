/**
 * HolidaysPage — holiday calendars + their entries (affects pricing day-type).
 *
 * HQ-only (backend enforces). Each calendar holds a replace-on-save list of
 * dated holiday entries; the pricing resolver treats those dates as HOLIDAY.
 *
 * P3b slice of master-data. Ingredients (+ purchase units), accounts, units and
 * the Excel import are tracked as P3c in the plan.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Button, Dialog, FormField } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  DetailDrawer,
  InlineError,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination } from "./_shared/table";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";

interface HolidayEntry {
  date: string;
  name: string;
  isCustom?: boolean;
}
interface HolidayCalendar {
  id: string;
  year: number;
  name: string;
  branchId: string | null;
  entries: HolidayEntry[];
}

const toDateStr = (iso: string) => iso.slice(0, 10);

export const HolidaysPage: React.FC = () => {
  const { api } = useAuth();
  const [selected, setSelected] = React.useState<HolidayCalendar | null>(null);
  const [creating, setCreating] = React.useState(false);

  const listQuery = useQuery({
    queryKey: QUERY_KEYS.holidays(),
    queryFn: () => api.get<HolidayCalendar[] | { data: HolidayCalendar[] }>("/master-data/holiday-calendars"),
  });
  const rows = unwrapList(listQuery.data);

  const columns = React.useMemo<ColumnDef<HolidayCalendar>[]>(
    () => [
      {
        id: "year",
        enableSorting: false,
        meta: { headerLabel: "Năm", width: "80px", align: "right" },
        header: "Năm",
        cell: ({ row }) => row.original.year,
      },
      {
        id: "name",
        enableSorting: false,
        meta: { headerLabel: "Tên" },
        header: "Tên",
        cell: ({ row }) => row.original.name,
      },
      {
        id: "scope",
        enableSorting: false,
        meta: { headerLabel: "Phạm vi" },
        header: "Phạm vi",
        cell: ({ row }) => (row.original.branchId ? "Chi nhánh" : "Toàn chuỗi"),
      },
      {
        id: "count",
        enableSorting: false,
        meta: { headerLabel: "Số ngày lễ", align: "right" },
        header: "Số ngày lễ",
        cell: ({ row }) => row.original.entries.length,
      },
    ],
    [],
  );

  const table = useDataTable<HolidayCalendar>({
    data: rows,
    columns,
    total: rows.length,
    page: 1,
    limit: rows.length || 50,
    sort: null,
    setPage: () => {},
    setLimit: () => {},
    setSort: () => {},
    getRowId: (c) => c.id,
  });

  return (
    <>
      <ListPageShell
        activePath="/master-data/holidays"
        pageTitle="Lịch lễ"
        actions={
          <Button variant="action" onClick={() => setCreating(true)}>
            Lịch mới
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
          />
        }
        pagination={
          !listQuery.isLoading && !listQuery.isError
            ? <DataTablePagination table={table} total={rows.length} />
            : undefined
        }
      >
        {listQuery.isLoading ? (
          <LoadingState />
        ) : listQuery.isError ? (
          <ErrorState message={toErrorMessage(listQuery.error, "Không tải được lịch lễ")} />
        ) : (
          <DataTable
            table={table}
            isLoading={false}
            isError={false}
            onRowClick={(c) => setSelected(c)}
            empty="Chưa có lịch lễ."
          />
        )}
      </ListPageShell>

      {creating && <CreateCalendarDialog api={api} onClose={() => setCreating(false)} />}
      <EntriesDrawer calendar={selected} api={api} onClose={() => setSelected(null)} />
    </>
  );
};

const CreateCalendarDialog: React.FC<{ api: ReturnType<typeof useAuth>["api"]; onClose: () => void }> = ({ api, onClose }) => {
  const qc = useQueryClient();
  const [year, setYear] = React.useState(String(new Date().getFullYear()));
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.post("/master-data/holiday-calendars", { year: Number.parseInt(year, 10), name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.holidays() });
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const y = Number.parseInt(year, 10);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return setError("Năm không hợp lệ");
    if (!name.trim()) return setError("Nhập tên lịch");
    setError(null);
    createMutation.mutate();
  };

  return (
    <Dialog open title="Lịch lễ mới" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <FormField name="year" label="Năm *" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
        <FormField name="name" label="Tên *" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Lễ 2026" />
        <InlineError message={error} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button type="submit" variant="action" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Đang tạo…" : "Tạo"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

const EntriesDrawer: React.FC<{ calendar: HolidayCalendar | null; api: ReturnType<typeof useAuth>["api"]; onClose: () => void }> = ({ calendar, api, onClose }) => {
  const qc = useQueryClient();
  const [entries, setEntries] = React.useState<HolidayEntry[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setEntries(calendar ? calendar.entries.map((e) => ({ date: toDateStr(e.date), name: e.name })) : []);
    setError(null);
  }, [calendar]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.request(`/master-data/holiday-calendars/${calendar!.id}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.holidays() });
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e)),
  });

  const addRow = () => setEntries((es) => [...es, { date: "", name: "" }]);
  const setRow = (i: number, patch: Partial<HolidayEntry>) => setEntries((es) => es.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const removeRow = (i: number) => setEntries((es) => es.filter((_, idx) => idx !== i));

  const save = () => {
    if (entries.some((e) => !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !e.name.trim())) {
      return setError("Mỗi ngày lễ cần ngày (YYYY-MM-DD) và tên");
    }
    setError(null);
    saveMutation.mutate();
  };

  if (!calendar) return <DetailDrawer open={false} title="" onClose={onClose} children={null} />;

  return (
    <DetailDrawer open title={`Ngày lễ — ${calendar.name} (${calendar.year})`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {entries.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <input type="date" aria-label={`Ngày ${i + 1}`} value={e.date} onChange={(ev) => setRow(i, { date: ev.target.value })} />
            <input aria-label={`Tên ngày ${i + 1}`} placeholder="Tên ngày lễ" value={e.name} onChange={(ev) => setRow(i, { name: ev.target.value })} style={{ flex: 1, height: "var(--input-height, 44px)", padding: "0 var(--space-3)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }} />
            <Button variant="ghost" onClick={() => removeRow(i)} aria-label={`Xoá ngày ${i + 1}`}>
              ✕
            </Button>
          </div>
        ))}
        <Button variant="ghost" onClick={addRow}>
          + Thêm ngày lễ
        </Button>
        <InlineError message={error} />
        <Button variant="action" disabled={saveMutation.isPending} onClick={save}>
          {saveMutation.isPending ? "Đang lưu…" : "Lưu ngày lễ"}
        </Button>
      </div>
    </DetailDrawer>
  );
};
