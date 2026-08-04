/**
 * TicketRecipesPage — manage per-ticket-type ingredient recipes (định mức) (B1).
 *
 * Chain-wide config (HQ/owner). Pick a ticket type, edit its ingredient lines
 * (base-unit consumption per one ticket), and save — PUT replaces the whole
 * recipe. Selling that ticket later auto-deducts Σ(qty × tickets) from stock.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { QUERY_KEYS } from "../lib/query-keys";
import { useNavigate } from "react-router-dom";
import { Select, InlineError, LoadingState, toErrorMessage } from "./_shared/admin-ui";
import { PageHeader } from "../layout/page-header";

interface TicketType {
  id: string;
  name: string;
}
interface IngredientOption {
  id: string;
  name: string;
  unit?: { code: string };
}
interface RecipeLine {
  ingredientId: string;
  ingredientName: string;
  unitCode: string;
  qtyBase: number;
}

interface Branch {
  id: string;
  code?: string;
  name: string;
}

const CHAIN_WIDE = new Set(["QUAN_TRI_HQ", "CHU_CHUOI"]);

export const TicketRecipesPage: React.FC = () => {
  const { api, role, selectedBranchId } = useAuth();
  const isChainWide = !!role && CHAIN_WIDE.has(role);
  const [ticketTypeId, setTicketTypeId] = React.useState("");
  // "" = chain-wide default; a branch id = that branch's override.
  const [scope, setScope] = React.useState("");

  const ticketTypes = useQuery({
    queryKey: QUERY_KEYS.ticketTypes(),
    queryFn: () => api.get<TicketType[] | { data: TicketType[] }>("/sales/ticket-types"),
  });
  const ingredients = useQuery({
    queryKey: QUERY_KEYS.ingredients(),
    queryFn: () => api.get<IngredientOption[] | { data: IngredientOption[] }>("/master-data/ingredients?pageSize=500"),
  });
  const branchesQuery = useQuery({
    queryKey: QUERY_KEYS.branches(),
    enabled: isChainWide,
    queryFn: () => api.get<Branch[] | { data: Branch[] }>("/branches"),
  });
  const ttList = unwrapList(ticketTypes.data);
  const ingredientList = unwrapList(ingredients.data);
  const branches = unwrapList(branchesQuery.data);

  React.useEffect(() => {
    if (!ticketTypeId && ttList.length > 0) setTicketTypeId(ttList[0].id);
  }, [ttList, ticketTypeId]);

  // A branch manager can only edit their own branch's override.
  React.useEffect(() => {
    if (!isChainWide && selectedBranchId) setScope(selectedBranchId);
  }, [isChainWide, selectedBranchId]);

  const navigate = useNavigate();
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <PageHeader
        activePath="/inventory/recipes"
        pageTitle="Định mức theo loại vé"
        onNavigate={(p) => navigate(p)}
      />
      <section
        style={{
          background: "var(--bg-raised, #FFFFFF)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          padding: "var(--space-5)",
        }}
      >
        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <label style={labelCol}>
            Loại vé
            <Select aria-label="Loại vé" value={ticketTypeId} onChange={(e) => setTicketTypeId(e.target.value)}>
              <option value="">— Chọn loại vé —</option>
              {ttList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </label>

          <label style={labelCol}>
            Phạm vi
            {isChainWide ? (
              <Select aria-label="Phạm vi" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">Chung (mọi chi nhánh)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code ? `${b.code} — ${b.name}` : b.name}
                  </option>
                ))}
              </Select>
            ) : (
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", paddingTop: "6px" }}>Chi nhánh của bạn</span>
            )}
          </label>
        </div>

        {ticketTypeId && <RecipeEditor ticketTypeId={ticketTypeId} branchId={scope} ingredients={ingredientList} />}
      </section>
    </div>
  );
};

const RecipeEditor: React.FC<{ ticketTypeId: string; branchId: string; ingredients: IngredientOption[] }> = ({ ticketTypeId, branchId, ingredients }) => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [lines, setLines] = React.useState<{ ingredientId: string; qtyBase: string }[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const branchParam = branchId ? `&branchId=${branchId}` : "";

  const recipe = useQuery({
    queryKey: QUERY_KEYS.ticketRecipe(ticketTypeId, branchId),
    queryFn: () => api.get<{ data: RecipeLine[] }>(`/inventory/recipes?ticketTypeId=${ticketTypeId}${branchParam}`),
  });
  const isEmptyOverride = !!branchId && (recipe.data?.data.length ?? 0) === 0;

  React.useEffect(() => {
    if (recipe.data) {
      setLines(recipe.data.data.map((l) => ({ ingredientId: l.ingredientId, qtyBase: String(l.qtyBase) })));
      setSaved(false);
    }
  }, [recipe.data]);

  const setLine = (i: number, p: Partial<{ ingredientId: string; qtyBase: string }>) =>
    setLines((cur) => cur.map((x, idx) => (idx === i ? { ...x, ...p } : x)));

  const save = useMutation({
    mutationFn: () =>
      api.request(`/inventory/recipes/${ticketTypeId}${branchId ? `?branchId=${branchId}` : ""}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: lines.map((l) => ({ ingredientId: l.ingredientId, qtyBase: Number(l.qtyBase) })) }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.ticketRecipe(ticketTypeId, branchId) });
      setSaved(true);
      setError(null);
    },
    onError: (e) => setError(toErrorMessage(e, "Lưu định mức thất bại")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const ids = lines.map((l) => l.ingredientId);
    if (ids.some((id) => !id)) return setError("Chọn nguyên liệu cho mỗi dòng");
    if (new Set(ids).size !== ids.length) return setError("Nguyên liệu bị trùng");
    if (lines.some((l) => !(Number(l.qtyBase) > 0))) return setError("Định mức phải lớn hơn 0");
    setError(null);
    save.mutate();
  };

  if (recipe.isLoading) return <LoadingState />;

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
      {isEmptyOverride && (
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          Chi nhánh này chưa có định mức riêng — đang dùng định mức chung. Thêm dòng để tạo định mức riêng.
        </p>
      )}
      {lines.map((l, i) => {
        const unit = ingredients.find((ing) => ing.id === l.ingredientId)?.unit?.code ?? "";
        return (
          <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: "160px" }}>
              <Select aria-label={`Nguyên liệu ${i + 1}`} value={l.ingredientId} onChange={(e) => setLine(i, { ingredientId: e.target.value })} minWidth="100%">
                <option value="">— Nguyên liệu —</option>
                {ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name}
                  </option>
                ))}
              </Select>
            </div>
            <input aria-label={`Định mức ${i + 1}`} type="number" step="any" placeholder="Số lượng / 1 vé" value={l.qtyBase} onChange={(e) => setLine(i, { qtyBase: e.target.value })} style={{ ...inputStyle, width: "140px" }} />
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", minWidth: "40px" }}>{unit}</span>
            <Button type="button" variant="ghost" aria-label={`Xoá dòng ${i + 1}`} onClick={() => setLines((cur) => cur.filter((_, idx) => idx !== i))}>
              ✕
            </Button>
          </div>
        );
      })}
      {lines.length === 0 && <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Chưa có định mức. Thêm dòng để bắt đầu.</p>}

      <div>
        <Button type="button" variant="ghost" onClick={() => setLines((cur) => [...cur, { ingredientId: "", qtyBase: "" }])}>
          + Thêm nguyên liệu
        </Button>
      </div>

      <InlineError message={error} />
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <Button type="submit" variant="action" disabled={save.isPending}>
          {save.isPending ? "Đang lưu…" : "Lưu định mức"}
        </Button>
        {saved && <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Đã lưu.</span>}
      </div>
    </form>
  );
};

const labelCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  fontSize: "var(--text-xs)",
  color: "var(--text-muted)",
  minWidth: "240px",
};

const inputStyle: React.CSSProperties = {
  height: "var(--input-height, 44px)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
};
