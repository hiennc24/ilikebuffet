/**
 * DiscountsPage — discount management screen.
 *
 * Two sections:
 *   1. "Chương trình giảm giá" — CRUD for DiscountProgram (PERCENT/FIXED_AMOUNT/VOUCHER).
 *   2. "Lý do giảm giá thủ công" — create DiscountReason entries.
 *
 * Only QUAN_TRI_HQ may create/update/deactivate programs and create reasons;
 * server returns 403 for lower roles, surfaced via toErrorMessage.
 *
 * Client-side guards:
 *   PERCENT  → pct 1–100 (required)
 *   FIXED    → amountVnd > 0 (required)
 *   VOUCHER  → voucherCode non-empty (required)
 */

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, FormField, Dialog } from "@ilikebuffet/ui";
import { formatVnd } from "@ilikebuffet/shared";
import {
  Card,
  DataTable,
  Badge,
  PageStack,
  LoadingState,
  ErrorState,
  Select,
  InlineError,
  toErrorMessage,
  type Column,
  type BadgeTone,
} from "./_shared/admin-ui";
import { useAuth } from "../auth/auth-context";
import { QUERY_KEYS } from "../lib/query-keys";

// ── Types ─────────────────────────────────────────────────────────────────────

type DiscountKind = "PERCENT" | "FIXED_AMOUNT" | "VOUCHER";

interface DiscountProgram {
  id: string;
  name: string;
  kind: DiscountKind;
  pct: number | null;
  amountVnd: number | null;
  voucherCode: string | null;
  quotaTotal: number | null;
  quotaRemaining: number | null;
  validFrom: string | null;
  validUntil: string | null;
  branchScope: string[] | null;
  status: "ACTIVE" | string;
  createdAt: string;
}

interface DiscountReason {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

// ── Create program form state ─────────────────────────────────────────────────

interface CreateProgramForm {
  kind: DiscountKind;
  name: string;
  pct: string;
  amountVnd: string;
  voucherCode: string;
  quotaTotal: string;
  validFrom: string;
  validUntil: string;
}

const EMPTY_CREATE_FORM: CreateProgramForm = {
  kind: "PERCENT",
  name: "",
  pct: "",
  amountVnd: "",
  voucherCode: "",
  quotaTotal: "",
  validFrom: "",
  validUntil: "",
};

// ── Edit program form state ───────────────────────────────────────────────────

interface EditProgramForm {
  name: string;
  validFrom: string;
  validUntil: string;
  branchScope: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function kindLabel(kind: DiscountKind): string {
  if (kind === "PERCENT") return "Phần trăm";
  if (kind === "FIXED_AMOUNT") return "Số tiền";
  return "Voucher";
}

function kindTone(kind: DiscountKind): BadgeTone {
  if (kind === "PERCENT") return "active";
  if (kind === "FIXED_AMOUNT") return "warn";
  return "neutral";
}

function programValue(program: DiscountProgram): string {
  if (program.kind === "PERCENT") return `${program.pct ?? "—"}%`;
  if (program.kind === "FIXED_AMOUNT") {
    return program.amountVnd !== null ? formatVnd(program.amountVnd) : "—";
  }
  return program.voucherCode ?? "—";
}

function validityRange(program: DiscountProgram): string {
  if (!program.validFrom && !program.validUntil) return "Không giới hạn";
  const from = program.validFrom ?? "…";
  const until = program.validUntil ?? "…";
  return `${from} – ${until}`;
}

function quotaDisplay(program: DiscountProgram): string {
  if (program.quotaTotal === null) return "Không giới hạn";
  return `${program.quotaRemaining ?? 0}/${program.quotaTotal}`;
}

// ── Create program dialog ─────────────────────────────────────────────────────

interface CreateProgramDialogProps {
  onClose: () => void;
  onSubmit: (form: CreateProgramForm) => Promise<void>;
  submitting: boolean;
  submitError: string | null;
}

const CreateProgramDialog: React.FC<CreateProgramDialogProps> = ({
  onClose,
  onSubmit,
  submitting,
  submitError,
}) => {
  const [form, setForm] = React.useState<CreateProgramForm>(EMPTY_CREATE_FORM);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const set =
    (field: keyof CreateProgramForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setValidationError(null);
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!form.name.trim()) {
      setValidationError("Tên chương trình là bắt buộc.");
      return;
    }

    if (form.kind === "PERCENT") {
      const pct = Number(form.pct);
      if (!form.pct || !Number.isFinite(pct) || pct < 1 || pct > 100) {
        setValidationError("Phần trăm phải nằm trong khoảng 1–100.");
        return;
      }
    } else if (form.kind === "FIXED_AMOUNT") {
      const amount = Number(form.amountVnd);
      if (!form.amountVnd || !Number.isFinite(amount) || amount <= 0) {
        setValidationError("Số tiền giảm phải lớn hơn 0.");
        return;
      }
    } else if (form.kind === "VOUCHER") {
      if (!form.voucherCode.trim()) {
        setValidationError("Mã voucher không được để trống.");
        return;
      }
    }

    await onSubmit(form);
  };

  return (
    <Dialog open title="Thêm chương trình giảm giá" onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
      >
        {/* Kind select */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <label
            htmlFor="field-kind"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              color: "var(--text-primary)",
            }}
          >
            Loại giảm giá *
          </label>
          <Select id="field-kind" value={form.kind} onChange={set("kind")}>
            <option value="PERCENT">Phần trăm</option>
            <option value="FIXED_AMOUNT">Số tiền cố định</option>
            <option value="VOUCHER">Voucher</option>
          </Select>
        </div>

        <FormField
          name="name"
          label="Tên chương trình *"
          value={form.name}
          onChange={set("name")}
          placeholder="VD: Giảm 10% cuối tuần"
        />

        {/* Conditional kind-specific field */}
        {form.kind === "PERCENT" && (
          <FormField
            name="pct"
            label="Phần trăm giảm (1–100) *"
            type="number"
            value={form.pct}
            onChange={set("pct")}
            placeholder="10"
          />
        )}
        {form.kind === "FIXED_AMOUNT" && (
          <FormField
            name="amountVnd"
            label="Số tiền giảm (VND) *"
            type="number"
            value={form.amountVnd}
            onChange={set("amountVnd")}
            placeholder="50000"
          />
        )}
        {form.kind === "VOUCHER" && (
          <FormField
            name="voucherCode"
            label="Mã voucher *"
            value={form.voucherCode}
            onChange={set("voucherCode")}
            placeholder="VD: WELCOME2024"
          />
        )}

        <FormField
          name="quotaTotal"
          label="Hạn mức sử dụng (trống = không giới hạn)"
          type="number"
          value={form.quotaTotal}
          onChange={set("quotaTotal")}
          placeholder="100"
        />

        <FormField
          name="validFrom"
          label="Hiệu lực từ ngày"
          type="text"
          value={form.validFrom}
          onChange={set("validFrom")}
          placeholder="YYYY-MM-DD"
        />

        <FormField
          name="validUntil"
          label="Hiệu lực đến ngày"
          type="text"
          value={form.validUntil}
          onChange={set("validUntil")}
          placeholder="YYYY-MM-DD"
        />

        <InlineError message={validationError ?? submitError} />

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
          <Button type="submit" variant="action" disabled={submitting || !form.name.trim()}>
            {submitting ? "Đang lưu…" : "Tạo chương trình"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

// ── Edit program dialog ───────────────────────────────────────────────────────

interface EditProgramDialogProps {
  program: DiscountProgram;
  onClose: () => void;
  onSubmit: (form: EditProgramForm) => Promise<void>;
  submitting: boolean;
  submitError: string | null;
}

const EditProgramDialog: React.FC<EditProgramDialogProps> = ({
  program,
  onClose,
  onSubmit,
  submitting,
  submitError,
}) => {
  const [form, setForm] = React.useState<EditProgramForm>({
    name: program.name,
    validFrom: program.validFrom ?? "",
    validUntil: program.validUntil ?? "",
    branchScope: (program.branchScope ?? []).join(", "),
  });

  React.useEffect(() => {
    setForm({
      name: program.name,
      validFrom: program.validFrom ?? "",
      validUntil: program.validUntil ?? "",
      branchScope: (program.branchScope ?? []).join(", "),
    });
  }, [program]);

  const set =
    (field: keyof EditProgramForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(form);
  };

  return (
    <Dialog open title="Sửa chương trình giảm giá" onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
      >
        <FormField
          name="name"
          label="Tên chương trình *"
          value={form.name}
          onChange={set("name")}
        />

        <FormField
          name="validFrom"
          label="Hiệu lực từ ngày"
          type="text"
          value={form.validFrom}
          onChange={set("validFrom")}
          placeholder="YYYY-MM-DD"
        />

        <FormField
          name="validUntil"
          label="Hiệu lực đến ngày"
          type="text"
          value={form.validUntil}
          onChange={set("validUntil")}
          placeholder="YYYY-MM-DD"
        />

        <FormField
          name="branchScope"
          label="Giới hạn chi nhánh (ID cách nhau dấu phẩy; trống = tất cả)"
          value={form.branchScope}
          onChange={set("branchScope")}
          placeholder="branch-id-1, branch-id-2"
        />

        <InlineError message={submitError} />

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
          <Button type="submit" variant="action" disabled={submitting || !form.name.trim()}>
            {submitting ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

// ── Deactivate confirm dialog ─────────────────────────────────────────────────

interface DeactivateProgramDialogProps {
  program: DiscountProgram;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  submitting: boolean;
  submitError: string | null;
}

const DeactivateProgramDialog: React.FC<DeactivateProgramDialogProps> = ({
  program,
  onClose,
  onConfirm,
  submitting,
  submitError,
}) => (
  <Dialog open title="Ngưng chương trình giảm giá" onClose={onClose}>
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          color: "var(--text-primary)",
        }}
      >
        Bạn có chắc muốn ngưng chương trình{" "}
        <strong style={{ color: "var(--text-primary)" }}>{program.name}</strong>? Hành động này
        sẽ vô hiệu hoá chương trình giảm giá này.
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

// ── Create reason dialog ──────────────────────────────────────────────────────

interface CreateReasonDialogProps {
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
  submitting: boolean;
  submitError: string | null;
}

const CreateReasonDialog: React.FC<CreateReasonDialogProps> = ({
  onClose,
  onSubmit,
  submitting,
  submitError,
}) => {
  const [name, setName] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onSubmit(name.trim());
  };

  return (
    <Dialog open title="Thêm lý do giảm giá" onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
      >
        <FormField
          name="name"
          label="Tên lý do *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: Khách VIP, sinh nhật, khiếu nại"
        />

        <InlineError message={submitError} />

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
          <Button type="submit" variant="action" disabled={submitting || !name.trim()}>
            {submitting ? "Đang lưu…" : "Tạo lý do"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────

type ProgramDialogMode = "closed" | "create" | "edit" | "deactivate";

export const DiscountsPage: React.FC = () => {
  const { api } = useAuth();
  const queryClient = useQueryClient();

  // ── Program dialog state ────────────────────────────────────────────────────

  const [programDialog, setProgramDialog] = React.useState<ProgramDialogMode>("closed");
  const [editingProgram, setEditingProgram] = React.useState<DiscountProgram | null>(null);
  const [deactivatingProgram, setDeactivatingProgram] = React.useState<DiscountProgram | null>(null);
  const [programCreateError, setProgramCreateError] = React.useState<string | null>(null);
  const [programEditError, setProgramEditError] = React.useState<string | null>(null);
  const [programDeactivateError, setProgramDeactivateError] = React.useState<string | null>(null);

  // ── Reason dialog state ─────────────────────────────────────────────────────

  const [reasonDialogOpen, setReasonDialogOpen] = React.useState(false);
  const [reasonCreateError, setReasonCreateError] = React.useState<string | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const {
    data: programs,
    isLoading: programsLoading,
    error: programsError,
  } = useQuery({
    queryKey: QUERY_KEYS.discountPrograms(),
    queryFn: () => api.get<DiscountProgram[]>("/sales/discounts/programs"),
  });

  const {
    data: reasons,
    isLoading: reasonsLoading,
    error: reasonsError,
  } = useQuery({
    queryKey: QUERY_KEYS.discountReasons(),
    queryFn: () => api.get<DiscountReason[]>("/sales/discounts/reasons"),
  });

  // ── Create program mutation ─────────────────────────────────────────────────

  const createProgramMutation = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api.post<DiscountProgram>("/sales/discounts/programs", dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.discountPrograms() });
      setProgramDialog("closed");
      setProgramCreateError(null);
    },
    onError: (err) => {
      setProgramCreateError(toErrorMessage(err));
    },
  });

  // ── Update program mutation ─────────────────────────────────────────────────

  const updateProgramMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Record<string, unknown> }) =>
      api.request<DiscountProgram>(`/sales/discounts/programs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dto),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.discountPrograms() });
      setProgramDialog("closed");
      setEditingProgram(null);
      setProgramEditError(null);
    },
    onError: (err) => {
      setProgramEditError(toErrorMessage(err));
    },
  });

  // ── Deactivate program mutation ─────────────────────────────────────────────

  const deactivateProgramMutation = useMutation({
    mutationFn: (id: string) =>
      api.request<void>(`/sales/discounts/programs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.discountPrograms() });
      setProgramDialog("closed");
      setDeactivatingProgram(null);
      setProgramDeactivateError(null);
    },
    onError: (err) => {
      setProgramDeactivateError(toErrorMessage(err));
    },
  });

  // ── Create reason mutation ──────────────────────────────────────────────────

  const createReasonMutation = useMutation({
    mutationFn: (name: string) =>
      api.post<DiscountReason>("/sales/discounts/reasons", { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.discountReasons() });
      setReasonDialogOpen(false);
      setReasonCreateError(null);
    },
    onError: (err) => {
      setReasonCreateError(toErrorMessage(err));
    },
  });

  // ── Program handlers ────────────────────────────────────────────────────────

  const openCreateProgram = () => {
    setProgramCreateError(null);
    setProgramDialog("create");
  };

  const openEditProgram = (program: DiscountProgram) => {
    setEditingProgram(program);
    setProgramEditError(null);
    setProgramDialog("edit");
  };

  const openDeactivateProgram = (program: DiscountProgram, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeactivatingProgram(program);
    setProgramDeactivateError(null);
    setProgramDialog("deactivate");
  };

  const handleCreateProgramSubmit = async (form: CreateProgramForm) => {
    const dto: Record<string, unknown> = {
      name: form.name.trim(),
      kind: form.kind,
    };

    if (form.kind === "PERCENT") dto.pct = Number(form.pct);
    if (form.kind === "FIXED_AMOUNT") dto.amountVnd = Number(form.amountVnd);
    if (form.kind === "VOUCHER") dto.voucherCode = form.voucherCode.trim();

    if (form.quotaTotal.trim()) dto.quotaTotal = Number(form.quotaTotal);
    if (form.validFrom.trim()) dto.validFrom = form.validFrom.trim();
    if (form.validUntil.trim()) dto.validUntil = form.validUntil.trim();

    await createProgramMutation.mutateAsync(dto);
  };

  const handleEditProgramSubmit = async (form: EditProgramForm) => {
    if (!editingProgram) return;
    const dto: Record<string, unknown> = { name: form.name.trim() };

    if (form.validFrom.trim()) dto.validFrom = form.validFrom.trim();
    if (form.validUntil.trim()) dto.validUntil = form.validUntil.trim();
    if (form.branchScope.trim()) {
      dto.branchScope = form.branchScope.split(",").map((s) => s.trim()).filter(Boolean);
    }

    await updateProgramMutation.mutateAsync({ id: editingProgram.id, dto });
  };

  const handleDeactivateProgramConfirm = async () => {
    if (!deactivatingProgram) return;
    await deactivateProgramMutation.mutateAsync(deactivatingProgram.id);
  };

  // ── Reason handlers ─────────────────────────────────────────────────────────

  const openCreateReason = () => {
    setReasonCreateError(null);
    setReasonDialogOpen(true);
  };

  const handleCreateReasonSubmit = async (name: string) => {
    await createReasonMutation.mutateAsync(name);
  };

  // ── Programs table columns ──────────────────────────────────────────────────

  const programColumns: Column<DiscountProgram>[] = [
    {
      key: "name",
      header: "Tên chương trình",
      render: (row) => (
        <span
          style={{
            color: "var(--text-primary)",
            fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
          }}
        >
          {row.name}
        </span>
      ),
    },
    {
      key: "kind",
      header: "Loại",
      width: "120px",
      render: (row) => <Badge tone={kindTone(row.kind)}>{kindLabel(row.kind)}</Badge>,
    },
    {
      key: "value",
      header: "Giá trị",
      width: "140px",
      render: (row) => (
        <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {programValue(row)}
        </span>
      ),
    },
    {
      key: "quota",
      header: "Hạn mức",
      width: "120px",
      align: "right",
      render: (row) => (
        <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {quotaDisplay(row)}
        </span>
      ),
    },
    {
      key: "validity",
      header: "Hiệu lực",
      width: "180px",
      render: (row) => (
        <span style={{ color: "var(--text-secondary)" }}>{validityRange(row)}</span>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: "120px",
      render: (row) => (
        <Badge tone={row.status === "ACTIVE" ? "active" : "muted"}>
          {row.status === "ACTIVE" ? "Đang áp dụng" : "Ngưng"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "160px",
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
              openEditProgram(row);
            }}
            style={{ height: "30px", padding: "0 var(--space-3)", fontSize: "var(--text-xs)" }}
          >
            Sửa
          </Button>
          {row.status === "ACTIVE" && (
            <Button
              variant="danger"
              onClick={(e) => openDeactivateProgram(row, e)}
              style={{ height: "30px", padding: "0 var(--space-3)", fontSize: "var(--text-xs)" }}
            >
              Ngưng
            </Button>
          )}
        </span>
      ),
    },
  ];

  // ── Reasons table columns ───────────────────────────────────────────────────

  const reasonColumns: Column<DiscountReason>[] = [
    {
      key: "name",
      header: "Tên lý do",
      render: (row) => (
        <span
          style={{
            color: "var(--text-primary)",
            fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
          }}
        >
          {row.name}
        </span>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: "120px",
      render: (row) => (
        <Badge tone={row.isActive ? "active" : "muted"}>
          {row.isActive ? "Đang dùng" : "Ngưng"}
        </Badge>
      ),
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <PageStack>
        {/* Programs card */}
        <Card
          title="Chương trình giảm giá"
          description="Quản lý các chương trình giảm giá. Chỉ QUAN_TRI_HQ có thể thêm, sửa, ngưng."
          actions={
            <Button variant="action" onClick={openCreateProgram}>
              Thêm chương trình
            </Button>
          }
        >
          {programsLoading && <LoadingState />}
          {!programsLoading && programsError && (
            <ErrorState message={toErrorMessage(programsError)} />
          )}
          {!programsLoading && !programsError && (
            <DataTable<DiscountProgram>
              columns={programColumns}
              rows={programs ?? []}
              rowKey={(row) => row.id}
              onRowClick={openEditProgram}
              emptyText="Chưa có chương trình giảm giá nào. Nhấn 'Thêm chương trình' để bắt đầu."
            />
          )}
        </Card>

        {/* Reasons card */}
        <Card
          title="Lý do giảm giá thủ công"
          description="Danh sách lý do giảm giá thủ công dùng khi thu ngân áp dụng giảm giá tại quầy."
          actions={
            <Button variant="action" onClick={openCreateReason}>
              Thêm lý do
            </Button>
          }
        >
          {reasonsLoading && <LoadingState />}
          {!reasonsLoading && reasonsError && (
            <ErrorState message={toErrorMessage(reasonsError)} />
          )}
          {!reasonsLoading && !reasonsError && (
            <DataTable<DiscountReason>
              columns={reasonColumns}
              rows={reasons ?? []}
              rowKey={(row) => row.id}
              emptyText="Chưa có lý do giảm giá nào."
            />
          )}
        </Card>
      </PageStack>

      {/* Program dialogs */}
      {programDialog === "create" && (
        <CreateProgramDialog
          onClose={() => setProgramDialog("closed")}
          onSubmit={handleCreateProgramSubmit}
          submitting={createProgramMutation.isPending}
          submitError={programCreateError}
        />
      )}

      {programDialog === "edit" && editingProgram && (
        <EditProgramDialog
          program={editingProgram}
          onClose={() => {
            setProgramDialog("closed");
            setEditingProgram(null);
          }}
          onSubmit={handleEditProgramSubmit}
          submitting={updateProgramMutation.isPending}
          submitError={programEditError}
        />
      )}

      {programDialog === "deactivate" && deactivatingProgram && (
        <DeactivateProgramDialog
          program={deactivatingProgram}
          onClose={() => {
            setProgramDialog("closed");
            setDeactivatingProgram(null);
          }}
          onConfirm={handleDeactivateProgramConfirm}
          submitting={deactivateProgramMutation.isPending}
          submitError={programDeactivateError}
        />
      )}

      {/* Reason dialog */}
      {reasonDialogOpen && (
        <CreateReasonDialog
          onClose={() => setReasonDialogOpen(false)}
          onSubmit={handleCreateReasonSubmit}
          submitting={createReasonMutation.isPending}
          submitError={reasonCreateError}
        />
      )}
    </>
  );
};
