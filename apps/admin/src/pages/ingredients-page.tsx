/**
 * IngredientsPage — the ingredient ecosystem (P3c): units + groups + ingredients
 * CRUD (with ≤3 purchase units) + Excel import.
 *
 * HQ-only (backend enforces). Units/groups are the selects an ingredient needs,
 * so they're managed here too. Accounts remain a separate carry-over (P3d).
 *
 * Layout: DTV-style ListPageShell for the ingredients table.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Button, Dialog, FormField } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { usePagedList } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";
import {
  Card,
  Select,
  InlineError,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import {
  DataTable,
  DataTablePagination,
  useDataTable,
  Badge,
} from "./_shared/table";

const PAGE_SIZE = 20;

interface Unit {
  id: string;
  code: string;
  name: string;
}
interface Group {
  id: string;
  name: string;
}
interface PurchaseUnit {
  unitId: string;
  factorToBase: number;
  unit?: Unit;
}
interface Ingredient {
  id: string;
  code: string | null;
  name: string;
  groupId: string;
  unitId: string;
  status: "ACTIVE" | "INACTIVE";
  group?: { name: string };
  unit?: { code: string };
  purchaseUnits: PurchaseUnit[];
}

export const IngredientsPage: React.FC = () => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = React.useState({ search: "", status: "", groupId: "" });
  const [page, setPage] = React.useState(1);
  const [editing, setEditing] = React.useState<Ingredient | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [importResult, setImportResult] = React.useState<string | null>(null);
  const [importError, setImportError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const units = useQuery({ queryKey: QUERY_KEYS.units(), queryFn: () => api.get<Unit[] | { data: Unit[] }>("/master-data/units") });
  const groups = useQuery({ queryKey: QUERY_KEYS.ingredientGroups(), queryFn: () => api.get<Group[] | { data: Group[] }>("/master-data/ingredient-groups") });
  const unitList = unwrapList(units.data);
  const groupList = unwrapList(groups.data);

  const { rows, total, isLoading, isError, error } = usePagedList<Ingredient>({
    queryKey: QUERY_KEYS.ingredients(),
    path: "/master-data/ingredients",
    page,
    pageSize: PAGE_SIZE,
    filters,
  });

  const patch = (p: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
  };

  const importMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload<{ validCount: number; errorCount: number }>("/import/ingredients", form);
    },
    onSuccess: (res) => {
      setImportError(null);
      setImportResult(`Nhập ${res.validCount} dòng hợp lệ, ${res.errorCount} lỗi.`);
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.ingredients() });
    },
    onError: (e) => {
      setImportResult(null);
      setImportError(toErrorMessage(e, "Nhập Excel thất bại"));
    },
  });

  const columns = React.useMemo<ColumnDef<Ingredient>[]>(
    () => [
      {
        id: "code",
        enableSorting: false,
        meta: { headerLabel: "Mã" },
        header: "Mã",
        cell: ({ row }) => row.original.code ?? "—",
      },
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
        id: "unit",
        enableSorting: false,
        meta: { headerLabel: "ĐVT" },
        header: "ĐVT",
        cell: ({ row }) => row.original.unit?.code ?? "—",
      },
      {
        id: "status",
        enableSorting: false,
        meta: { headerLabel: "Trạng thái" },
        header: "Trạng thái",
        cell: ({ row }) => {
          const active = row.original.status === "ACTIVE";
          return (
            <Badge dot tone={active ? "success" : "neutral"}>
              {active ? "Đang dùng" : "Ngưng"}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  const table = useDataTable<Ingredient>({
    data: rows,
    columns,
    total,
    page,
    limit: PAGE_SIZE,
    sort: null,
    setPage,
    setLimit: () => {},
    setSort: () => {},
    getRowId: (i) => i.id,
  });

  return (
    <>
      {/* Unit + group quick-manage cards */}
      <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", marginBottom: "var(--space-5)" }}>
        <div style={{ flex: 1, minWidth: "280px" }}>
          <SimpleListCard title="Đơn vị" placeholder="Mã (VD KG)" secondaryPlaceholder="Tên (Kilogram)" rows={unitList.map((u) => `${u.code} — ${u.name}`)} onCreate={(code, name) => api.post("/master-data/units", { code, name })} invalidateKey={QUERY_KEYS.units()} api={api} />
        </div>
        <div style={{ flex: 1, minWidth: "280px" }}>
          <SimpleListCard title="Nhóm nguyên liệu" placeholder="Tên nhóm" rows={groupList.map((g) => g.name)} onCreate={(name) => api.post("/master-data/ingredient-groups", { name })} invalidateKey={QUERY_KEYS.ingredientGroups()} api={api} />
        </div>
      </div>

      <ListPageShell
        activePath="/inventory"
        pageTitle="Kho nguyên liệu"
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              aria-label="Chọn file Excel"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importMutation.mutate(f);
                e.target.value = "";
              }}
            />
            <Button variant="ghost" disabled={importMutation.isPending} onClick={() => fileRef.current?.click()}>
              {importMutation.isPending ? "Đang nhập…" : "Nhập Excel"}
            </Button>
            <Button variant="action" onClick={() => setCreating(true)}>
              Nguyên liệu mới
            </Button>
          </div>
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
            <input
              type="search"
              aria-label="Tìm nguyên liệu"
              placeholder="Tìm mã/tên…"
              value={filters.search}
              onChange={(e) => patch({ search: e.target.value })}
              style={inputStyle}
            />
            <Select aria-label="Nhóm" value={filters.groupId} onChange={(e) => patch({ groupId: e.target.value })}>
              <option value="">Tất cả nhóm</option>
              {groupList.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Trạng thái" value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
              <option value="">Tất cả</option>
              <option value="ACTIVE">Đang dùng</option>
              <option value="INACTIVE">Ngưng</option>
            </Select>
          </PageToolbar>
        }
        pagination={!isLoading && !isError ? <DataTablePagination table={table} total={total} /> : undefined}
      >
        {(importResult || importError) && (
          <div style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
            {importResult && <Badge tone="success">{importResult}</Badge>}
            <InlineError message={importError} />
          </div>
        )}
        {isLoading ? (
          <div style={{ padding: "var(--space-5)" }}>
            <LoadingState />
          </div>
        ) : isError ? (
          <div style={{ padding: "var(--space-5)" }}>
            <ErrorState message={toErrorMessage(error, "Không tải được nguyên liệu")} />
          </div>
        ) : (
          <DataTable
            table={table}
            isLoading={false}
            isError={false}
            onRowClick={(i) => setEditing(i)}
            empty="Chưa có nguyên liệu."
          />
        )}
      </ListPageShell>

      {(creating || editing) && (
        <IngredientDialog
          ingredient={editing}
          units={unitList}
          groups={groupList}
          api={api}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </>
  );
};

// ── Units / groups quick-manage card ────────────────────────────────────────

const SimpleListCard: React.FC<{
  title: string;
  placeholder: string;
  secondaryPlaceholder?: string;
  rows: string[];
  onCreate: (a: string, b: string) => Promise<unknown>;
  invalidateKey: readonly unknown[];
  api: ReturnType<typeof useAuth>["api"];
}> = ({ title, placeholder, secondaryPlaceholder, rows, onCreate, invalidateKey }) => {
  const qc = useQueryClient();
  const [a, setA] = React.useState("");
  const [b, setB] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => onCreate(a, b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: invalidateKey });
      setA("");
      setB("");
      setError(null);
    },
    onError: (e) => setError(toErrorMessage(e)),
  });
  return (
    <Card title={title}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <input aria-label={`${title} - trường 1`} placeholder={placeholder} value={a} onChange={(e) => setA(e.target.value)} style={inputStyle} />
          {secondaryPlaceholder && <input aria-label={`${title} - trường 2`} placeholder={secondaryPlaceholder} value={b} onChange={(e) => setB(e.target.value)} style={inputStyle} />}
          <Button variant="action" disabled={!a.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            Thêm
          </Button>
        </div>
        <InlineError message={error} />
        <ul style={{ margin: 0, paddingLeft: "var(--space-4)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
          {rows.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
          {rows.length === 0 && <li style={{ listStyle: "none", color: "var(--text-muted)" }}>Chưa có.</li>}
        </ul>
      </div>
    </Card>
  );
};

// ── Ingredient create/edit dialog ────────────────────────────────────────────

const IngredientDialog: React.FC<{ ingredient: Ingredient | null; units: Unit[]; groups: Group[]; api: ReturnType<typeof useAuth>["api"]; onClose: () => void }> = ({ ingredient, units, groups, api, onClose }) => {
  const qc = useQueryClient();
  const [name, setName] = React.useState(ingredient?.name ?? "");
  const [groupId, setGroupId] = React.useState(ingredient?.groupId ?? groups[0]?.id ?? "");
  const [unitId, setUnitId] = React.useState(ingredient?.unitId ?? units[0]?.id ?? "");
  const [pus, setPus] = React.useState<{ unitId: string; factorToBase: string }[]>(
    ingredient?.purchaseUnits.map((p) => ({ unitId: p.unitId, factorToBase: String(p.factorToBase) })) ?? [],
  );
  const [error, setError] = React.useState<string | null>(null);
  const invalidate = () => void qc.invalidateQueries({ queryKey: QUERY_KEYS.ingredients() });

  const body = () => ({
    name,
    groupId,
    unitId,
    purchaseUnits: pus.map((p) => ({ unitId: p.unitId, factorToBase: Number(p.factorToBase) })),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      ingredient
        ? api.request(`/master-data/ingredients/${ingredient.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body()) })
        : api.post("/master-data/ingredients", body()),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Nhập tên nguyên liệu");
    if (!groupId || !unitId) return setError("Chọn nhóm và đơn vị cơ bản");
    if (pus.length > 3) return setError("Tối đa 3 đơn vị mua");
    if (pus.some((p) => !p.unitId || !(Number(p.factorToBase) > 0))) return setError("Đơn vị mua cần đơn vị + hệ số > 0");
    setError(null);
    saveMutation.mutate();
  };

  const addPu = () => setPus((cur) => (cur.length < 3 ? [...cur, { unitId: units[0]?.id ?? "", factorToBase: "" }] : cur));

  return (
    <Dialog open title={ingredient ? `Sửa ${ingredient.name}` : "Nguyên liệu mới"} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <FormField name="name" label="Tên *" value={name} onChange={(e) => setName(e.target.value)} />
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
        <label style={labelStyle}>
          Đơn vị cơ bản *
          <Select aria-label="Đơn vị cơ bản" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.name}
              </option>
            ))}
          </Select>
        </label>

        <fieldset style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
          <legend style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Đơn vị mua (≤3)</legend>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {pus.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                <Select aria-label={`Đơn vị mua ${i + 1}`} value={p.unitId} onChange={(e) => setPus((cur) => cur.map((x, idx) => (idx === i ? { ...x, unitId: e.target.value } : x)))}>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code}
                    </option>
                  ))}
                </Select>
                <input aria-label={`Hệ số ${i + 1}`} type="number" step="any" placeholder="Hệ số → ĐV cơ bản" value={p.factorToBase} onChange={(e) => setPus((cur) => cur.map((x, idx) => (idx === i ? { ...x, factorToBase: e.target.value } : x)))} style={{ ...inputStyle, flex: 1 }} />
                <Button type="button" variant="ghost" aria-label={`Xoá ĐV mua ${i + 1}`} onClick={() => setPus((cur) => cur.filter((_, idx) => idx !== i))}>
                  ✕
                </Button>
              </div>
            ))}
            {pus.length < 3 && (
              <Button type="button" variant="ghost" onClick={addPu}>
                + Thêm đơn vị mua
              </Button>
            )}
          </div>
        </fieldset>

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
  height: "var(--input-height, 44px)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
};
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" };
