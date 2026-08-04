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
import type { ColumnDef } from "@tanstack/react-table";
import { formatVnd, roundVnd } from "@ilikebuffet/shared";
import { Button, Dialog } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { usePagedList } from "../lib/use-paged-list";
import { canApprovePo } from "../lib/rbac";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  PageStack,
  DetailDrawer,
  Select,
  InlineError,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import { DataTable, useDataTable, DataTablePagination, Badge } from "./_shared/table";
import type { BadgeTone } from "./_shared/table";
import { ListPageShell } from "../layout/list-page-shell";
import { PageToolbar, PageTabs } from "../layout/page-header";

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
  status: "DRAFT" | "APPROVED" | "SENT" | "RECEIVED" | "CANCELLED";
  note: string | null;
  createdAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  needsApproval?: boolean;
  totalVnd: number;
  lines: PoLineView[];
}

const STATUS_LABEL: Record<PoRow["status"], string> = {
  DRAFT: "Nháp",
  APPROVED: "Đã duyệt",
  SENT: "Đã gửi",
  RECEIVED: "Đã nhập",
  CANCELLED: "Đã huỷ",
};

// Map PO statuses to the new table Badge tones (neutral/success/warn/danger/info).
// DRAFT=neutral (not yet actionable), APPROVED=info (queued), SENT=info (in-transit),
// RECEIVED=success (completed), CANCELLED=warn (terminal failure).
const STATUS_TONE: Record<PoRow["status"], BadgeTone> = {
  DRAFT: "neutral",
  APPROVED: "info",
  SENT: "info",
  RECEIVED: "success",
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

  const { rows, total, isLoading, isError, error } = usePagedList<PoRow>({
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

  const columns = React.useMemo<ColumnDef<PoRow>[]>(
    () => [
      {
        id: "code",
        enableSorting: false,
        meta: { headerLabel: "Mã đơn" },
        header: "Mã đơn",
        cell: ({ row }) => row.original.code,
      },
      {
        id: "supplier",
        enableSorting: false,
        meta: { headerLabel: "Nhà cung cấp" },
        header: "Nhà cung cấp",
        cell: ({ row }) => row.original.supplierName,
      },
      {
        id: "date",
        enableSorting: false,
        meta: { headerLabel: "Ngày tạo" },
        header: "Ngày tạo",
        cell: ({ row }) => vnDate(row.original.createdAt),
      },
      {
        id: "total",
        enableSorting: false,
        meta: { headerLabel: "Tổng tiền", align: "right" as const },
        header: "Tổng tiền",
        cell: ({ row }) => formatVnd(row.original.totalVnd),
      },
      {
        id: "status",
        enableSorting: false,
        meta: { headerLabel: "Trạng thái" },
        header: "Trạng thái",
        cell: ({ row }) => (
          <Badge tone={STATUS_TONE[row.original.status]}>
            {STATUS_LABEL[row.original.status]}
          </Badge>
        ),
      },
    ],
    [],
  );

  const table = useDataTable<PoRow>({
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
    <PageStack>
      <ListPageShell
        activePath="/inventory/purchase-orders"
        pageTitle="Đơn mua"
        actions={
          <Button variant="action" onClick={() => setCreating(true)}>
            Đơn mua mới
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
            <Select aria-label="Trạng thái" value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
              <option value="">Tất cả trạng thái</option>
              <option value="DRAFT">Nháp</option>
              <option value="APPROVED">Đã duyệt</option>
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
          <ErrorState message={toErrorMessage(error, "Không tải được danh sách đơn mua")} />
        ) : (
          <DataTable
            table={table}
            onRowClick={(row) => setSelectedId(row.id)}
            empty="Chưa có đơn mua."
          />
        )}
      </ListPageShell>

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
  const { api, role } = useAuth();
  const qc = useQueryClient();
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [receiving, setReceiving] = React.useState(false);
  const mayApprove = canApprovePo(role);

  const detail = useQuery({
    queryKey: poId ? QUERY_KEYS.purchaseOrder(poId) : ["purchase-order", "none"],
    enabled: !!poId,
    queryFn: () => api.get<PoRow>(`/inventory/purchase-orders/${poId}`),
  });
  const po = detail.data;

  const act = useMutation({
    mutationFn: (action: "approve" | "reject" | "send" | "cancel") => api.post(`/inventory/purchase-orders/${poId}/${action}`, {}),
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
            {po.approvedBy && <Row label="Người duyệt" value={po.approvedBy} />}
            {po.note && <Row label="Ghi chú" value={po.note} />}
          </section>

          <Section title="Dòng hàng">
            {po.lines.map((l) => (
              <Row key={l.id} label={`${l.ingredientName} ×${l.qty} ${l.unitCode}`} value={formatVnd(l.lineTotalVnd)} />
            ))}
          </Section>

          <InlineError message={actionError} />
          {po.status === "DRAFT" && po.needsApproval && !mayApprove && (
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Đơn vượt ngưỡng — cần quản lý duyệt trước khi gửi.
            </p>
          )}
          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
            {po.status === "DRAFT" && po.needsApproval && mayApprove && (
              <Button variant="action" disabled={act.isPending} onClick={() => act.mutate("approve")}>
                Duyệt
              </Button>
            )}
            {po.status === "DRAFT" && !po.needsApproval && (
              <Button variant="action" disabled={act.isPending} onClick={() => act.mutate("send")}>
                Gửi NCC
              </Button>
            )}
            {po.status === "APPROVED" && (
              <>
                {mayApprove && (
                  <Button variant="ghost" disabled={act.isPending} onClick={() => act.mutate("reject")}>
                    Từ chối
                  </Button>
                )}
                <Button variant="action" disabled={act.isPending} onClick={() => act.mutate("send")}>
                  Gửi NCC
                </Button>
              </>
            )}
            {po.status === "SENT" && (
              <Button variant="action" disabled={act.isPending} onClick={() => setReceiving(true)}>
                Nhập kho
              </Button>
            )}
            {(po.status === "DRAFT" || po.status === "APPROVED" || po.status === "SENT") && (
              <Button variant="ghost" disabled={act.isPending} onClick={() => act.mutate("cancel")}>
                Huỷ đơn
              </Button>
            )}
          </div>

          {receiving && <ReceiveDialog po={po} onClose={() => setReceiving(false)} />}
        </div>
      )}
    </DetailDrawer>
  );
};

// ── Receive-goods dialog ────────────────────────────────────────────────────

const ReceiveDialog: React.FC<{ po: PoRow; onClose: () => void }> = ({ po, onClose }) => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [rows, setRows] = React.useState(
    po.lines.map((l) => ({
      ingredientId: l.ingredientId,
      ingredientName: l.ingredientName,
      unitId: l.unitId,
      unitCode: l.unitCode,
      qty: String(l.qty),
      unitPriceVnd: String(l.unitPriceVnd),
    })),
  );
  const [error, setError] = React.useState<string | null>(null);

  const setRow = (i: number, p: Partial<(typeof rows)[number]>) =>
    setRows((cur) => cur.map((x, idx) => (idx === i ? { ...x, ...p } : x)));

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/inventory/purchase-orders/${po.id}/receive`, {
        lines: rows.map((r) => ({
          ingredientId: r.ingredientId,
          unitId: r.unitId,
          qty: Number(r.qty),
          unitPriceVnd: Number.parseInt(r.unitPriceVnd, 10),
        })),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(po.id) });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders() });
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e, "Nhập kho thất bại")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    for (const r of rows) {
      if (!(Number(r.qty) > 0)) return setError("Số lượng nhận phải lớn hơn 0");
      if (!Number.isInteger(Number(r.unitPriceVnd)) || Number(r.unitPriceVnd) < 0)
        return setError("Đơn giá phải là số nguyên ≥ 0");
    }
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open title={`Nhập kho — ${po.code}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          Số lượng và đơn giá nhận thực tế (có thể khác đơn mua).
        </p>
        {rows.map((r, i) => (
          <div key={r.ingredientId + r.unitId} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: 2, minWidth: "120px", fontSize: "var(--text-sm)" }}>
              {r.ingredientName} <span style={{ color: "var(--text-muted)" }}>({r.unitCode})</span>
            </span>
            <input aria-label={`Số lượng nhận ${i + 1}`} type="number" step="any" placeholder="SL" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} style={{ ...inputStyle, width: "90px" }} />
            <input aria-label={`Đơn giá nhận ${i + 1}`} type="number" placeholder="Đơn giá" value={r.unitPriceVnd} onChange={(e) => setRow(i, { unitPriceVnd: e.target.value })} style={{ ...inputStyle, width: "120px" }} />
          </div>
        ))}
        <InlineError message={error} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button type="submit" variant="action" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang nhập…" : "Xác nhận nhập"}
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
