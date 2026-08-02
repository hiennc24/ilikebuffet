/**
 * PurchaseOrdersPage — create and manage purchase orders to suppliers (W1).
 *
 * Branch-scoped by the backend. Lists POs via the paginated
 * GET /inventory/purchase-orders, creates DRAFTs with an ingredient/unit/qty/
 * price line editor (running total = roundVnd(price × qty), server authoritative),
 * and drives the DRAFT → SENT → CANCELLED lifecycle from a detail drawer.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatVnd, roundVnd } from "@ilikebuffet/shared";
import { Button, Dialog } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
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
  Select,
  InlineError,
  Badge,
  BadgeTone,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";

const PAGE_SIZE = 20;

interface Supplier {
  id: string;
  name: string;
  status?: string;
}
interface IngredientUnit {
  code: string;
}
interface IngredientOption {
  id: string;
  name: string;
  code: string | null;
  unitId: string;
  unit?: IngredientUnit;
  purchaseUnits: { unitId: string; unit?: IngredientUnit }[];
}
interface PoLineView {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientCode: string | null;
  unitId: string;
  unitCode: string;
  qty: number;
  unitPriceVnd: number;
  lineTotalVnd: number;
}
interface PoRow {
  id: string;
  code: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  status: "DRAFT" | "SENT" | "RECEIVED" | "CANCELLED";
  note: string | null;
  createdAt: string;
  totalVnd: number;
  lines: PoLineView[];
}

const STATUS_LABEL: Record<PoRow["status"], string> = {
  DRAFT: "Nháp",
  SENT: "Đã gửi",
  RECEIVED: "Đã nhập",
  CANCELLED: "Đã huỷ",
};
const STATUS_TONE: Record<PoRow["status"], BadgeTone> = {
  DRAFT: "muted",
  SENT: "active",
  RECEIVED: "active",
  CANCELLED: "warn",
};

const vnDate = (iso: string) => iso.slice(0, 10);

export const PurchaseOrdersPage: React.FC = () => {
  const { api } = useAuth();
  const [filters, setFilters] = React.useState({ status: "", supplierId: "", q: "" });
  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const suppliers = useQuery({
    queryKey: QUERY_KEYS.suppliers(),
    queryFn: () => api.get<Supplier[] | { data: Supplier[] }>("/master-data/suppliers"),
  });
  const supplierList = unwrapList(suppliers.data).filter((s) => s.status !== "INACTIVE");

  const { rows, total, pageCount, isLoading, isError, error } = usePagedList<PoRow>({
    queryKey: QUERY_KEYS.purchaseOrders(),
    path: "/inventory/purchase-orders",
    page,
    pageSize: PAGE_SIZE,
    filters,
  });

  const patch = (p: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
  };

  const columns: Column<PoRow>[] = [
    { key: "code", header: "Mã đơn", render: (p) => p.code },
    { key: "supplier", header: "Nhà cung cấp", render: (p) => p.supplierName },
    { key: "date", header: "Ngày tạo", render: (p) => vnDate(p.createdAt) },
    { key: "total", header: "Tổng tiền", align: "right", render: (p) => formatVnd(p.totalVnd) },
    {
      key: "status",
      header: "Trạng thái",
      render: (p) => <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>,
    },
  ];

  return (
    <PageStack>
      <Card
        title="Đơn mua"
        description="Tạo và quản lý đơn mua hàng tới nhà cung cấp."
        actions={
          <Button variant="action" onClick={() => setCreating(true)}>
            Đơn mua mới
          </Button>
        }
      >
        <FilterBar>
          <Select aria-label="Trạng thái" value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
            <option value="">Tất cả trạng thái</option>
            <option value="DRAFT">Nháp</option>
            <option value="SENT">Đã gửi</option>
            <option value="RECEIVED">Đã nhập</option>
            <option value="CANCELLED">Đã huỷ</option>
          </Select>
          <Select aria-label="Nhà cung cấp" value={filters.supplierId} onChange={(e) => patch({ supplierId: e.target.value })}>
            <option value="">Tất cả NCC</option>
            {supplierList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <input
            type="search"
            aria-label="Tìm mã đơn"
            placeholder="Tìm mã đơn…"
            value={filters.q}
            onChange={(e) => patch({ q: e.target.value })}
            style={inputStyle}
          />
        </FilterBar>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được danh sách đơn mua")} />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} onRowClick={(p) => setSelectedId(p.id)} emptyText="Chưa có đơn mua." />
            <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      {creating && <PoCreateDialog suppliers={supplierList} onClose={() => setCreating(false)} />}
      <PoDetailDrawer poId={selectedId} onClose={() => setSelectedId(null)} />
    </PageStack>
  );
};

// ── Create dialog ────────────────────────────────────────────────────────────

interface DraftLine {
  ingredientId: string;
  unitId: string;
  qty: string;
  unitPriceVnd: string;
}

const PoCreateDialog: React.FC<{ suppliers: Supplier[]; onClose: () => void }> = ({ suppliers, onClose }) => {
  const { api, selectedBranchId } = useAuth();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = React.useState(suppliers[0]?.id ?? "");
  const [note, setNote] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([{ ingredientId: "", unitId: "", qty: "", unitPriceVnd: "" }]);
  const [error, setError] = React.useState<string | null>(null);

  const ingredients = useQuery({
    queryKey: QUERY_KEYS.ingredients(),
    queryFn: () => api.get<IngredientOption[] | { data: IngredientOption[] }>("/master-data/ingredients?pageSize=500"),
  });
  const ingredientList = unwrapList(ingredients.data);
  const byId = React.useMemo(() => new Map(ingredientList.map((i) => [i.id, i])), [ingredientList]);

  /** Allowed units for a chosen ingredient: base unit + its purchase units. */
  const unitsFor = (ingredientId: string): { unitId: string; code: string }[] => {
    const ing = byId.get(ingredientId);
    if (!ing) return [];
    const base = { unitId: ing.unitId, code: ing.unit?.code ?? "ĐVCB" };
    const purchase = ing.purchaseUnits.map((pu) => ({ unitId: pu.unitId, code: pu.unit?.code ?? "ĐV" }));
    return [base, ...purchase];
  };

  const setLine = (i: number, p: Partial<DraftLine>) =>
    setLines((cur) => cur.map((x, idx) => (idx === i ? { ...x, ...p } : x)));

  const lineTotal = (l: DraftLine): number => {
    const qty = Number(l.qty);
    const price = Number(l.unitPriceVnd);
    if (!(qty > 0) || !(price >= 0)) return 0;
    // Preview only (server is authoritative); roundVnd enforces integer đồng and
    // qty is fractional, so multiplyVnd (integer-count only) does not apply.
    // eslint-disable-next-line money/no-unsafe-money-arithmetic -- roundVnd enforces the integer result
    return roundVnd(price * qty);
  };
  const grandTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post("/inventory/purchase-orders", {
        branchId: selectedBranchId,
        supplierId,
        note: note.trim() || undefined,
        lines: lines.map((l) => ({
          ingredientId: l.ingredientId,
          unitId: l.unitId,
          qty: Number(l.qty),
          unitPriceVnd: Number.parseInt(l.unitPriceVnd, 10),
        })),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders() });
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e, "Tạo đơn mua thất bại")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) return setError("Chưa chọn chi nhánh");
    if (!supplierId) return setError("Chọn nhà cung cấp");
    if (lines.length === 0) return setError("Đơn mua cần ít nhất 1 dòng");
    for (const l of lines) {
      if (!l.ingredientId || !l.unitId) return setError("Mỗi dòng cần nguyên liệu và đơn vị");
      if (!(Number(l.qty) > 0)) return setError("Số lượng phải lớn hơn 0");
      if (!Number.isInteger(Number(l.unitPriceVnd)) || Number(l.unitPriceVnd) < 0)
        return setError("Đơn giá phải là số nguyên ≥ 0");
    }
    setError(null);
    saveMutation.mutate();
  };

  return (
    <Dialog open title="Đơn mua mới" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <label style={labelStyle}>
          Nhà cung cấp *
          <Select aria-label="Nhà cung cấp" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— Chọn —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>

        <fieldset style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
          <legend style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Dòng hàng</legend>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {lines.map((l, i) => {
              const units = unitsFor(l.ingredientId);
              return (
                <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: 2, minWidth: "140px" }}>
                    <Select
                      aria-label={`Nguyên liệu ${i + 1}`}
                      value={l.ingredientId}
                      onChange={(e) => setLine(i, { ingredientId: e.target.value, unitId: "" })}
                      minWidth="100%"
                    >
                      <option value="">— Nguyên liệu —</option>
                      {ingredientList.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div style={{ flex: 1, minWidth: "90px" }}>
                    <Select aria-label={`Đơn vị ${i + 1}`} value={l.unitId} onChange={(e) => setLine(i, { unitId: e.target.value })} minWidth="100%">
                      <option value="">— ĐV —</option>
                      {units.map((u) => (
                        <option key={u.unitId} value={u.unitId}>
                          {u.code}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <input aria-label={`Số lượng ${i + 1}`} type="number" step="any" placeholder="SL" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} style={{ ...inputStyle, width: "80px" }} />
                  <input aria-label={`Đơn giá ${i + 1}`} type="number" placeholder="Đơn giá" value={l.unitPriceVnd} onChange={(e) => setLine(i, { unitPriceVnd: e.target.value })} style={{ ...inputStyle, width: "110px" }} />
                  <span style={{ minWidth: "90px", textAlign: "right", fontSize: "var(--text-sm)" }}>{formatVnd(lineTotal(l))}</span>
                  <Button type="button" variant="ghost" aria-label={`Xoá dòng ${i + 1}`} onClick={() => setLines((cur) => cur.filter((_, idx) => idx !== i))}>
                    ✕
                  </Button>
                </div>
              );
            })}
            <Button type="button" variant="ghost" onClick={() => setLines((cur) => [...cur, { ingredientId: "", unitId: "", qty: "", unitPriceVnd: "" }])}>
              + Thêm dòng
            </Button>
          </div>
        </fieldset>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", fontWeight: 600 }}>
          <span>Tổng cộng</span>
          <span>{formatVnd(grandTotal)}</span>
        </div>

        <label style={labelStyle}>
          Ghi chú
          <input aria-label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
        </label>

        <InlineError message={error} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button type="submit" variant="action" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Đang lưu…" : "Tạo đơn"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

// ── Detail drawer + lifecycle actions ───────────────────────────────────────

const PoDetailDrawer: React.FC<{ poId: string | null; onClose: () => void }> = ({ poId, onClose }) => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [actionError, setActionError] = React.useState<string | null>(null);

  const detail = useQuery({
    queryKey: poId ? QUERY_KEYS.purchaseOrder(poId) : ["purchase-order", "none"],
    enabled: !!poId,
    queryFn: () => api.get<PoRow>(`/inventory/purchase-orders/${poId}`),
  });
  const po = detail.data;

  const act = useMutation({
    mutationFn: (action: "send" | "cancel") => api.post(`/inventory/purchase-orders/${poId}/${action}`, {}),
    onSuccess: () => {
      if (poId) void qc.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(poId) });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders() });
      setActionError(null);
    },
    onError: (e) => setActionError(toErrorMessage(e, "Thao tác thất bại")),
  });

  return (
    <DetailDrawer open={!!poId} title={po ? `Đơn ${po.code}` : "Chi tiết đơn mua"} onClose={onClose}>
      {detail.isLoading || !po ? (
        <LoadingState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
          <section>
            <Row label="Nhà cung cấp" value={po.supplierName} />
            <Row label="Ngày tạo" value={vnDate(po.createdAt)} />
            <Row label="Trạng thái" value={STATUS_LABEL[po.status]} />
            <Row label="Tổng tiền" value={formatVnd(po.totalVnd)} />
            {po.note && <Row label="Ghi chú" value={po.note} />}
          </section>

          <Section title="Dòng hàng">
            {po.lines.map((l) => (
              <Row key={l.id} label={`${l.ingredientName} ×${l.qty} ${l.unitCode}`} value={formatVnd(l.lineTotalVnd)} />
            ))}
          </Section>

          <InlineError message={actionError} />
          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
            {po.status === "DRAFT" && (
              <Button variant="action" disabled={act.isPending} onClick={() => act.mutate("send")}>
                Gửi NCC
              </Button>
            )}
            {(po.status === "DRAFT" || po.status === "SENT") && (
              <Button variant="ghost" disabled={act.isPending} onClick={() => act.mutate("cancel")}>
                Huỷ đơn
              </Button>
            )}
          </div>
        </div>
      )}
    </DetailDrawer>
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

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", padding: "2px 0" }}>
    <span style={{ color: "var(--text-muted)" }}>{label}</span>
    <span style={{ color: "var(--text-primary)" }}>{value}</span>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
    <h3 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--text-muted)" }}>
      {title}
    </h3>
    {children}
  </section>
);
