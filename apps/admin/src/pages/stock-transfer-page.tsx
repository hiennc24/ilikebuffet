/**
 * StockTransferPage — inter-branch stock transfers (M10/X1).
 *
 * Create an atomic transfer (source → destination, one or more ingredient lines);
 * the backend blocks below-zero at the source and carries the source cost. Lists
 * past transfers. Gated to chain admins + branch managers (both-branch access).
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatVnd, roundVnd } from "@ilikebuffet/shared";
import { Button, Dialog } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { usePagedList } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import { Card, PageStack, DataTable, Column, Pagination, Select, InlineError, LoadingState, ErrorState, toErrorMessage } from "./_shared/admin-ui";

const PAGE_SIZE = 20;

interface Branch {
  id: string;
  code?: string;
  name: string;
}
interface Ingredient {
  id: string;
  name: string;
  unit?: { code: string };
}
interface TransferLineView {
  id: string;
  ingredientId: string;
  qtyBase: number;
  unitCostVnd: number;
}
interface TransferRow {
  id: string;
  code: string;
  fromBranchCode: string;
  toBranchCode: string;
  note: string | null;
  createdAt: string;
  lines: TransferLineView[];
}

const vnDate = (iso: string) => iso.slice(0, 10);
// roundVnd enforces integer đồng; qtyBase is fractional so multiplyVnd doesn't apply.
// eslint-disable-next-line money/no-unsafe-money-arithmetic -- roundVnd enforces the integer result
const lineValueVnd = (l: TransferLineView) => roundVnd(l.qtyBase * l.unitCostVnd);

export const StockTransferPage: React.FC = () => {
  const { api } = useAuth();
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);

  const branchesQuery = useQuery({ queryKey: QUERY_KEYS.branches(), queryFn: () => api.get<Branch[] | { data: Branch[] }>("/branches") });
  const branches = unwrapList(branchesQuery.data);

  const { rows, total, pageCount, isLoading, isError, error } = usePagedList<TransferRow>({
    queryKey: QUERY_KEYS.stockTransfers(),
    path: "/inventory/transfers",
    page,
    pageSize: PAGE_SIZE,
    filters: {},
  });

  const columns: Column<TransferRow>[] = [
    { key: "code", header: "Mã phiếu", render: (t) => t.code },
    { key: "route", header: "Chuyển", render: (t) => `${t.fromBranchCode} → ${t.toBranchCode}` },
    { key: "items", header: "Số dòng", align: "right", render: (t) => t.lines.length },
    { key: "value", header: "Giá trị", align: "right", render: (t) => formatVnd(t.lines.reduce((s, l) => s + lineValueVnd(l), 0)) },
    { key: "date", header: "Ngày", render: (t) => vnDate(t.createdAt) },
  ];

  return (
    <PageStack>
      <Card
        title="Điều chuyển kho"
        description="Chuyển nguyên liệu giữa các chi nhánh (tức thời, mang giá vốn nguồn)."
        actions={
          <Button variant="action" onClick={() => setCreating(true)}>
            Phiếu chuyển mới
          </Button>
        }
      >
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được phiếu chuyển")} />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(t) => t.id} emptyText="Chưa có phiếu chuyển." />
            <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      {creating && <TransferDialog branches={branches} onClose={() => setCreating(false)} />}
    </PageStack>
  );
};

interface DraftLine {
  ingredientId: string;
  qtyBase: string;
}

const TransferDialog: React.FC<{ branches: Branch[]; onClose: () => void }> = ({ branches, onClose }) => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [fromBranchId, setFromBranchId] = React.useState(branches[0]?.id ?? "");
  const [toBranchId, setToBranchId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([{ ingredientId: "", qtyBase: "" }]);
  const [error, setError] = React.useState<string | null>(null);

  const ingredients = useQuery({
    queryKey: QUERY_KEYS.ingredients(),
    queryFn: () => api.get<Ingredient[] | { data: Ingredient[] }>("/master-data/ingredients?pageSize=500"),
  });
  const ingredientList = unwrapList(ingredients.data);

  const setLine = (i: number, p: Partial<DraftLine>) => setLines((cur) => cur.map((x, idx) => (idx === i ? { ...x, ...p } : x)));

  const save = useMutation({
    mutationFn: () =>
      api.post("/inventory/transfers", {
        fromBranchId,
        toBranchId,
        note: note.trim() || undefined,
        lines: lines.map((l) => ({ ingredientId: l.ingredientId, qtyBase: Number(l.qtyBase) })),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.stockTransfers() });
      onClose();
    },
    onError: (e) => setError(toErrorMessage(e, "Tạo phiếu chuyển thất bại")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromBranchId || !toBranchId) return setError("Chọn chi nhánh nguồn và đích");
    if (fromBranchId === toBranchId) return setError("Nguồn và đích phải khác nhau");
    for (const l of lines) {
      if (!l.ingredientId) return setError("Chọn nguyên liệu cho mỗi dòng");
      if (!(Number(l.qtyBase) > 0)) return setError("Số lượng phải lớn hơn 0");
    }
    setError(null);
    save.mutate();
  };

  return (
    <Dialog open title="Phiếu chuyển mới" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <label style={labelStyle}>
            Từ chi nhánh
            <Select aria-label="Chi nhánh nguồn" value={fromBranchId} onChange={(e) => setFromBranchId(e.target.value)}>
              <option value="">— Chọn —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.code ? `${b.code} — ${b.name}` : b.name}</option>
              ))}
            </Select>
          </label>
          <label style={labelStyle}>
            Đến chi nhánh
            <Select aria-label="Chi nhánh đích" value={toBranchId} onChange={(e) => setToBranchId(e.target.value)}>
              <option value="">— Chọn —</option>
              {branches.filter((b) => b.id !== fromBranchId).map((b) => (
                <option key={b.id} value={b.id}>{b.code ? `${b.code} — ${b.name}` : b.name}</option>
              ))}
            </Select>
          </label>
        </div>

        <fieldset style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
          <legend style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Nguyên liệu chuyển</legend>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 2, minWidth: "160px" }}>
                  <Select aria-label={`Nguyên liệu ${i + 1}`} value={l.ingredientId} onChange={(e) => setLine(i, { ingredientId: e.target.value })} minWidth="100%">
                    <option value="">— Nguyên liệu —</option>
                    {ingredientList.map((ing) => (
                      <option key={ing.id} value={ing.id}>{ing.name}</option>
                    ))}
                  </Select>
                </div>
                <input aria-label={`Số lượng ${i + 1}`} type="number" step="any" placeholder="SL" value={l.qtyBase} onChange={(e) => setLine(i, { qtyBase: e.target.value })} style={{ ...inputStyle, width: "100px" }} />
                <Button type="button" variant="ghost" aria-label={`Xoá dòng ${i + 1}`} onClick={() => setLines((cur) => cur.filter((_, idx) => idx !== i))}>✕</Button>
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={() => setLines((cur) => [...cur, { ingredientId: "", qtyBase: "" }])}>+ Thêm dòng</Button>
          </div>
        </fieldset>

        <label style={labelStyle}>
          Ghi chú
          <input aria-label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
        </label>

        <InlineError message={error} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button type="button" variant="ghost" onClick={onClose}>Đóng</Button>
          <Button type="submit" variant="action" disabled={save.isPending}>{save.isPending ? "Đang tạo…" : "Tạo phiếu"}</Button>
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
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)", minWidth: "220px" };
