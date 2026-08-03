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
import { Card, PageStack, Select, InlineError, LoadingState, toErrorMessage } from "./_shared/admin-ui";

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

export const TicketRecipesPage: React.FC = () => {
  const { api } = useAuth();
  const [ticketTypeId, setTicketTypeId] = React.useState("");

  const ticketTypes = useQuery({
    queryKey: QUERY_KEYS.ticketTypes(),
    queryFn: () => api.get<TicketType[] | { data: TicketType[] }>("/sales/ticket-types"),
  });
  const ingredients = useQuery({
    queryKey: QUERY_KEYS.ingredients(),
    queryFn: () => api.get<IngredientOption[] | { data: IngredientOption[] }>("/master-data/ingredients?pageSize=500"),
  });
  const ttList = unwrapList(ticketTypes.data);
  const ingredientList = unwrapList(ingredients.data);

  React.useEffect(() => {
    if (!ticketTypeId && ttList.length > 0) setTicketTypeId(ttList[0].id);
  }, [ttList, ticketTypeId]);

  return (
    <PageStack>
      <Card title="Định mức theo loại vé" description="Ước tính nguyên liệu tiêu hao cho 1 vé — dùng để tự trừ kho khi bán.">
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)", maxWidth: "320px" }}>
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

        {ticketTypeId && <RecipeEditor ticketTypeId={ticketTypeId} ingredients={ingredientList} />}
      </Card>
    </PageStack>
  );
};

const RecipeEditor: React.FC<{ ticketTypeId: string; ingredients: IngredientOption[] }> = ({ ticketTypeId, ingredients }) => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [lines, setLines] = React.useState<{ ingredientId: string; qtyBase: string }[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const recipe = useQuery({
    queryKey: QUERY_KEYS.ticketRecipe(ticketTypeId),
    queryFn: () => api.get<{ data: RecipeLine[] }>(`/inventory/recipes?ticketTypeId=${ticketTypeId}`),
  });

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
      api.request(`/inventory/recipes/${ticketTypeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: lines.map((l) => ({ ingredientId: l.ingredientId, qtyBase: Number(l.qtyBase) })) }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.ticketRecipe(ticketTypeId) });
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

const inputStyle: React.CSSProperties = {
  height: "var(--input-height, 44px)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
};
