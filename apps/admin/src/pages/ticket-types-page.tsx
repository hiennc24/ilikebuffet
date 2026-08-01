/**
 * TicketTypesPage — VG-01 ticket type management screen.
 *
 * Allows HQ admins (QUAN_TRI_HQ) to create, edit, and deactivate ticket types.
 * Non-HQ users can view active types but mutations return 403 (surfaced via toErrorMessage).
 *
 * VG-01.2: free ticket types (isFree=true) count guests but price = 0.
 */

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, FormField, Dialog } from "@ilikebuffet/ui";
import {
  Card,
  DataTable,
  Badge,
  PageStack,
  LoadingState,
  ErrorState,
  toErrorMessage,
  type Column,
} from "./_shared/admin-ui";
import { useAuth } from "../auth/auth-context";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TicketType {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  color: string;
  isFree: boolean;
  status: "ACTIVE" | string;
  createdAt: string;
  updatedAt: string;
}

interface TicketTypeFormData {
  name: string;
  description: string;
  displayOrder: string;
  color: string;
  isFree: boolean;
}

type DialogMode = "closed" | "create" | "edit" | "deactivate";

// ── Constants ─────────────────────────────────────────────────────────────────

const QUERY_KEY = ["ticket-types"] as const;
const DEFAULT_COLOR = "#3B82F6";

const EMPTY_FORM: TicketTypeFormData = {
  name: "",
  description: "",
  displayOrder: "0",
  color: DEFAULT_COLOR,
  isFree: false,
};

// ── Form dialog ───────────────────────────────────────────────────────────────

interface TicketTypeFormDialogProps {
  mode: "create" | "edit";
  initial: TicketTypeFormData;
  onClose: () => void;
  onSubmit: (data: TicketTypeFormData) => Promise<void>;
  submitting: boolean;
  submitError: string | null;
}

const TicketTypeFormDialog: React.FC<TicketTypeFormDialogProps> = ({
  mode,
  initial,
  onClose,
  onSubmit,
  submitting,
  submitError,
}) => {
  const [form, setForm] = React.useState<TicketTypeFormData>(initial);

  // Reset form whenever dialog reopens with new initial values.
  React.useEffect(() => {
    setForm(initial);
  }, [initial]);

  const handleChange =
    (field: keyof TicketTypeFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, isFree: e.target.checked }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(form);
  };

  const title = mode === "create" ? "Thêm loại vé" : "Sửa loại vé";

  return (
    <Dialog open title={title} onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
      >
        <FormField
          name="name"
          label="Tên loại vé *"
          value={form.name}
          onChange={handleChange("name")}
          placeholder="VD: Vé người lớn"
        />

        <FormField
          name="description"
          label="Mô tả"
          value={form.description}
          onChange={handleChange("description")}
          placeholder="Mô tả ngắn (tuỳ chọn)"
        />

        <FormField
          name="displayOrder"
          label="Thứ tự hiển thị"
          type="number"
          value={form.displayOrder}
          onChange={handleChange("displayOrder")}
          placeholder="0"
        />

        <FormField
          name="color"
          label="Màu sắc"
          value={form.color}
          onChange={handleChange("color")}
          placeholder={DEFAULT_COLOR}
        />

        {/* Inline checkbox row — FormField has no checkbox variant. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            paddingTop: "var(--space-1)",
          }}
        >
          <input
            type="checkbox"
            id="field-isFree"
            checked={form.isFree}
            onChange={handleCheckbox}
            style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--action-bg)" }}
          />
          <label
            htmlFor="field-isFree"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              color: "var(--text-primary)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            Miễn phí{" "}
            <span
              style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "var(--text-xs)" }}
              title="Vé miễn phí vẫn tính vào số lượng khách nhưng giá = 0 đ (VG-01.2)"
            >
              (giá 0 đ, vẫn tính khách)
            </span>
          </label>
        </div>

        {submitError && (
          <span
            role="alert"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "#C0392B",
            }}
          >
            {submitError}
          </span>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--space-3)",
            paddingTop: "var(--space-2)",
          }}
        >
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button
            type="submit"
            variant="action"
            disabled={submitting || !form.name.trim()}
          >
            {submitting ? "Đang lưu…" : mode === "create" ? "Tạo loại vé" : "Lưu thay đổi"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

// ── Deactivate confirm dialog ─────────────────────────────────────────────────

interface DeactivateDialogProps {
  ticketType: TicketType;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  submitting: boolean;
  submitError: string | null;
}

const DeactivateDialog: React.FC<DeactivateDialogProps> = ({
  ticketType,
  onClose,
  onConfirm,
  submitting,
  submitError,
}) => {
  return (
    <Dialog open title="Ngưng loại vé" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            color: "var(--text-primary)",
          }}
        >
          Bạn có chắc muốn ngưng loại vé{" "}
          <strong style={{ color: "var(--text-primary)" }}>{ticketType.name}</strong>? Hành động
          này có thể hoàn tác bằng cách cập nhật trạng thái.
        </p>

        {submitError && (
          <span
            role="alert"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "#C0392B",
            }}
          >
            {submitError}
          </span>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--space-3)",
          }}
        >
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={submitting}>
            {submitting ? "Đang xử lý…" : "Ngưng"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────

export const TicketTypesPage: React.FC = () => {
  const { api } = useAuth();
  const queryClient = useQueryClient();

  // ── Dialog state ────────────────────────────────────────────────────────────

  const [dialogMode, setDialogMode] = React.useState<DialogMode>("closed");
  const [editingRow, setEditingRow] = React.useState<TicketType | null>(null);
  const [deactivatingRow, setDeactivatingRow] = React.useState<TicketType | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [deactivateError, setDeactivateError] = React.useState<string | null>(null);

  // ── Fetch list ──────────────────────────────────────────────────────────────

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.get<TicketType[]>("/sales/ticket-types"),
  });

  // ── Create mutation ─────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (dto: {
      name: string;
      description?: string;
      displayOrder?: number;
      color?: string;
      isFree?: boolean;
    }) => api.post<TicketType>("/sales/ticket-types", dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      closeDialog();
    },
    onError: (err) => {
      setFormError(toErrorMessage(err));
    },
  });

  // ── Update mutation ─────────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      dto,
    }: {
      id: string;
      dto: {
        name?: string;
        description?: string;
        displayOrder?: number;
        color?: string;
        isFree?: boolean;
      };
    }) =>
      api.request<TicketType>(`/sales/ticket-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dto),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      closeDialog();
    },
    onError: (err) => {
      setFormError(toErrorMessage(err));
    },
  });

  // ── Deactivate mutation ─────────────────────────────────────────────────────

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      api.request<void>(`/sales/ticket-types/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      closeDeactivateDialog();
    },
    onError: (err) => {
      setDeactivateError(toErrorMessage(err));
    },
  });

  // ── Dialog helpers ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingRow(null);
    setFormError(null);
    setDialogMode("create");
  };

  const openEdit = (row: TicketType) => {
    setEditingRow(row);
    setFormError(null);
    setDialogMode("edit");
  };

  const openDeactivate = (row: TicketType, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent row click opening edit dialog
    setDeactivatingRow(row);
    setDeactivateError(null);
    setDialogMode("deactivate");
  };

  const closeDialog = () => {
    setDialogMode("closed");
    setEditingRow(null);
    setFormError(null);
  };

  const closeDeactivateDialog = () => {
    setDialogMode("closed");
    setDeactivatingRow(null);
    setDeactivateError(null);
  };

  // ── Form submit ─────────────────────────────────────────────────────────────

  const handleFormSubmit = async (form: TicketTypeFormData) => {
    setFormError(null);
    const dto = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      displayOrder: parseInt(form.displayOrder, 10) || 0,
      color: form.color.trim() || DEFAULT_COLOR,
      isFree: form.isFree,
    };

    // Use try/catch so the error is handled here (onError also fires);
    // prevents unhandled rejection from mutateAsync re-throwing.
    try {
      if (dialogMode === "create") {
        await createMutation.mutateAsync(dto);
      } else if (dialogMode === "edit" && editingRow) {
        await updateMutation.mutateAsync({ id: editingRow.id, dto });
      }
    } catch {
      // Error is surfaced via mutation's onError → setFormError; swallow here.
    }
  };

  const handleDeactivateConfirm = async () => {
    if (!deactivatingRow) return;
    setDeactivateError(null);
    try {
      await deactivateMutation.mutateAsync(deactivatingRow.id);
    } catch {
      // Error surfaced via mutation's onError → setDeactivateError.
    }
  };

  // ── Table columns ───────────────────────────────────────────────────────────

  const columns: Column<TicketType>[] = [
    {
      key: "color-name",
      header: "Tên loại vé",
      render: (row) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: "16px",
              height: "16px",
              borderRadius: "4px",
              background: row.color || DEFAULT_COLOR,
              flexShrink: 0,
            }}
          />
          <span style={{ color: "var(--text-primary)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"] }}>
            {row.name}
          </span>
        </span>
      ),
    },
    {
      key: "description",
      header: "Mô tả",
      render: (row) => (
        <span
          style={{
            color: row.description ? "var(--text-secondary)" : "var(--text-muted)",
            maxWidth: "280px",
            display: "inline-block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {row.description || "—"}
        </span>
      ),
    },
    {
      key: "displayOrder",
      header: "Thứ tự",
      align: "right",
      width: "80px",
      render: (row) => (
        <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {row.displayOrder}
        </span>
      ),
    },
    {
      key: "isFree",
      header: "Loại giá",
      width: "120px",
      render: (row) =>
        row.isFree ? (
          <span
            title="Vé miễn phí vẫn tính vào số lượng khách nhưng giá = 0 đ (VG-01.2)"
            style={{ cursor: "help" }}
          >
            <Badge tone="warn">Miễn phí</Badge>
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>—</span>
        ),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: "120px",
      render: (row) => (
        <Badge tone={row.status === "ACTIVE" ? "active" : "muted"}>
          {row.status === "ACTIVE" ? "Đang dùng" : "Ngưng"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "140px",
      align: "right",
      render: (row) => (
        <span
          style={{ display: "inline-flex", gap: "var(--space-2)", alignItems: "center" }}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row);
            }}
            style={{ height: "30px", padding: "0 var(--space-3)", fontSize: "var(--text-xs)" }}
          >
            Sửa
          </Button>
          {row.status === "ACTIVE" && (
            <Button
              variant="danger"
              onClick={(e) => openDeactivate(row, e)}
              style={{ height: "30px", padding: "0 var(--space-3)", fontSize: "var(--text-xs)" }}
            >
              Ngưng
            </Button>
          )}
        </span>
      ),
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  const formInitial: TicketTypeFormData =
    dialogMode === "edit" && editingRow
      ? {
          name: editingRow.name,
          description: editingRow.description ?? "",
          displayOrder: String(editingRow.displayOrder),
          color: editingRow.color,
          isFree: editingRow.isFree,
        }
      : EMPTY_FORM;

  const formSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <PageStack>
        <Card
          title="Loại vé"
          description="Quản lý các loại vé phục vụ trong buffet (VG-01). HQ có thể thêm, sửa, ngưng loại vé."
          actions={
            <Button variant="action" onClick={openCreate}>
              Thêm loại vé
            </Button>
          }
        >
          {isLoading && <LoadingState />}
          {!isLoading && error && <ErrorState message={toErrorMessage(error)} />}
          {!isLoading && !error && (
            <DataTable<TicketType>
              columns={columns}
              rows={data ?? []}
              rowKey={(row) => row.id}
              onRowClick={openEdit}
              emptyText="Chưa có loại vé nào. Nhấn 'Thêm loại vé' để bắt đầu."
            />
          )}
        </Card>
      </PageStack>

      {(dialogMode === "create" || dialogMode === "edit") && (
        <TicketTypeFormDialog
          mode={dialogMode}
          initial={formInitial}
          onClose={closeDialog}
          onSubmit={handleFormSubmit}
          submitting={formSubmitting}
          submitError={formError}
        />
      )}

      {dialogMode === "deactivate" && deactivatingRow && (
        <DeactivateDialog
          ticketType={deactivatingRow}
          onClose={closeDeactivateDialog}
          onConfirm={handleDeactivateConfirm}
          submitting={deactivateMutation.isPending}
          submitError={deactivateError}
        />
      )}
    </>
  );
};
