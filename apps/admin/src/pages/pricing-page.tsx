/**
 * PricingPage — VG-02 pricing management screen (SC-TD pricing).
 *
 * Three cards:
 *   1. Khung giờ (time windows) — CRUD with overlap detection surfaced from server.
 *   2. Bảng giá (price-book versions) — version selector + create + Excel export.
 *   3. Ma trận giá (price matrix) — ticket types × time windows × day types.
 *
 * Only QUAN_TRI_HQ may mutate; server 403 is surfaced via toErrorMessage.
 * VG-02.3: live versions cannot be edited in place — new version required.
 */

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormField, Button, Dialog } from "@ilikebuffet/ui";
import { formatVnd } from "@ilikebuffet/shared";
import { useAuth } from "../auth/auth-context";
import {
  Card,
  DataTable,
  Column,
  PageStack,
  LoadingState,
  ErrorState,
  EmptyState,
  toErrorMessage,
} from "./_shared/admin-ui";

// ── Domain types ───────────────────────────────────────────────────────────────

interface TimeWindow {
  id: string;
  name: string;
  startMinute: number;
  endMinute: number;
  displayOrder: number;
  createdAt: string;
}

interface PriceBookVersion {
  id: string;
  name: string;
  effectiveFrom: string;
  branchId: string | null;
  createdAt: string;
  createdBy?: string | null;
}

interface PriceCell {
  id: string;
  versionId: string;
  ticketTypeId: string;
  timeWindowId: string;
  dayType: string;
  priceVnd: number;
  branchId: string | null;
}

interface TicketType {
  id: string;
  name: string;
  color: string;
  isFree: boolean;
  displayOrder: number;
  status: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const hhmm = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const DAY_TYPE_LABELS: Record<string, string> = {
  REGULAR: "Thường",
  WEEKEND: "Cuối tuần",
  HOLIDAY: "Lễ",
};

const DAY_TYPES = ["REGULAR", "WEEKEND", "HOLIDAY"] as const;

/** Download xlsx from a version-export endpoint using raw fetch with stored auth. */
async function exportVersionXlsx(versionId: string): Promise<void> {
  const token = sessionStorage.getItem("ibb_admin_at");
  const branchId = localStorage.getItem("ibb_admin_branch");
  const res = await fetch(`/sales/pricing/versions/${versionId}/export`, {
    headers: {
      Authorization: `Bearer ${token ?? ""}`,
      "x-branch-id": branchId ?? "",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Xuất Excel thất bại (${res.status}): ${text}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pricing-${versionId}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Time-Window Card ───────────────────────────────────────────────────────────

interface TimeWindowCardProps {
  api: ReturnType<typeof useAuth>["api"];
}

const TimeWindowCard: React.FC<TimeWindowCardProps> = ({ api }) => {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<TimeWindow[]>({
    queryKey: ["time-windows"],
    queryFn: () => api.get<TimeWindow[]>("/sales/pricing/time-windows"),
  });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [startMinute, setStartMinute] = React.useState("");
  const [endMinute, setEndMinute] = React.useState("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const resetDialog = () => {
    setName("");
    setStartMinute("");
    setEndMinute("");
    setSubmitError(null);
  };

  const openDialog = () => {
    resetDialog();
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    setSubmitError(null);
    const start = parseInt(startMinute, 10);
    const end = parseInt(endMinute, 10);

    if (!name.trim()) {
      setSubmitError("Tên khung giờ không được để trống.");
      return;
    }
    if (!Number.isInteger(start) || start < 0 || start > 1439) {
      setSubmitError("Bắt đầu phải từ 0 đến 1439.");
      return;
    }
    if (!Number.isInteger(end) || end < 1 || end > 1440) {
      setSubmitError("Kết thúc phải từ 1 đến 1440.");
      return;
    }
    if (end <= start) {
      setSubmitError("Kết thúc phải lớn hơn bắt đầu.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post<TimeWindow>("/sales/pricing/time-windows", {
        name: name.trim(),
        startMinute: start,
        endMinute: end,
      });
      await qc.invalidateQueries({ queryKey: ["time-windows"] });
      setDialogOpen(false);
    } catch (err) {
      setSubmitError(toErrorMessage(err, "Tạo khung giờ thất bại"));
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<TimeWindow>[] = [
    { key: "name", header: "Tên khung giờ", render: (r) => r.name },
    {
      key: "range",
      header: "Giờ",
      render: (r) => `${hhmm(r.startMinute)} – ${hhmm(r.endMinute)}`,
    },
    {
      key: "order",
      header: "Thứ tự",
      align: "right",
      width: "80px",
      render: (r) => r.displayOrder,
    },
  ];

  return (
    <>
      <Card
        title="Khung giờ"
        description="Cấu hình các khung giờ phục vụ để định giá theo ca."
        actions={
          <Button variant="action" onClick={openDialog}>
            Thêm khung giờ
          </Button>
        }
      >
        {isLoading && <LoadingState />}
        {!isLoading && error && <ErrorState message={toErrorMessage(error)} />}
        {!isLoading && !error && (
          <DataTable
            columns={columns}
            rows={data ?? []}
            rowKey={(r) => r.id}
            emptyText="Chưa có khung giờ nào. Nhấn 'Thêm khung giờ' để bắt đầu."
          />
        )}
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Thêm khung giờ"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
          }}
        >
          <FormField
            label="Tên khung giờ"
            name="tw-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Buổi tối"
          />
          <FormField
            label="Bắt đầu (phút từ 0h, 0–1439)"
            name="tw-start"
            type="number"
            value={startMinute}
            onChange={(e) => setStartMinute(e.target.value)}
            placeholder="VD: 1080 = 18:00"
          />
          <FormField
            label="Kết thúc (phút từ 0h, 1–1440)"
            name="tw-end"
            type="number"
            value={endMinute}
            onChange={(e) => setEndMinute(e.target.value)}
            placeholder="VD: 1320 = 22:00"
          />
          {startMinute !== "" && endMinute !== "" && (
            <p
              style={{
                margin: 0,
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
                fontFamily: "var(--font-sans)",
              }}
            >
              {hhmm(parseInt(startMinute, 10) || 0)} –{" "}
              {hhmm(parseInt(endMinute, 10) || 0)}
            </p>
          )}
          {submitError && (
            <span
              role="alert"
              style={{ fontSize: "var(--text-sm)", color: "#C0392B", fontFamily: "var(--font-sans)" }}
            >
              {submitError}
            </span>
          )}
          <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Hủy
            </Button>
            <Button variant="action" disabled={submitting} onClick={handleCreate}>
              {submitting ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
};

// ── Version selector card ──────────────────────────────────────────────────────

interface VersionCardProps {
  api: ReturnType<typeof useAuth>["api"];
  selectedVersionId: string | null;
  onSelectVersion: (id: string) => void;
}

const VersionCard: React.FC<VersionCardProps> = ({ api, selectedVersionId, onSelectVersion }) => {
  const qc = useQueryClient();

  const { data: versions, isLoading, error } = useQuery<PriceBookVersion[]>({
    queryKey: ["pricing-versions"],
    queryFn: () => api.get<PriceBookVersion[]>("/sales/pricing/versions"),
  });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [vName, setVName] = React.useState("");
  const [vDate, setVDate] = React.useState("");
  const [cloneFrom, setCloneFrom] = React.useState("");
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const resetCreate = () => {
    setVName("");
    setVDate("");
    setCloneFrom("");
    setCreateError(null);
  };

  const openCreate = () => {
    resetCreate();
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (!vName.trim()) {
      setCreateError("Tên bảng giá không được để trống.");
      return;
    }
    if (!vDate) {
      setCreateError("Ngày hiệu lực không được để trống.");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        name: vName.trim(),
        effectiveFrom: vDate,
      };
      if (cloneFrom) body.cloneFromVersionId = cloneFrom;
      const created = await api.post<PriceBookVersion>("/sales/pricing/versions", body);
      await qc.invalidateQueries({ queryKey: ["pricing-versions"] });
      onSelectVersion(created.id);
      setCreateOpen(false);
    } catch (err) {
      setCreateError(toErrorMessage(err, "Tạo bảng giá thất bại"));
    } finally {
      setCreating(false);
    }
  };

  const handleExport = async () => {
    if (!selectedVersionId) return;
    setExportError(null);
    setExporting(true);
    try {
      await exportVersionXlsx(selectedVersionId);
    } catch (err) {
      setExportError(toErrorMessage(err, "Xuất Excel thất bại"));
    } finally {
      setExporting(false);
    }
  };

  const versionList = versions ?? [];

  return (
    <>
      <Card
        title="Bảng giá"
        description="Chọn hoặc tạo bảng giá theo ngày hiệu lực."
        actions={
          <Button variant="action" onClick={openCreate}>
            Tạo bảng giá mới
          </Button>
        }
      >
        {isLoading && <LoadingState />}
        {!isLoading && error && <ErrorState message={toErrorMessage(error)} />}
        {!isLoading && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {versionList.length === 0 ? (
              <EmptyState text="Chưa có bảng giá nào. Nhấn 'Tạo bảng giá mới' để bắt đầu." />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <label
                  htmlFor="version-select"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-sm)",
                    color: "var(--text-secondary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  Bảng giá:
                </label>
                <select
                  id="version-select"
                  value={selectedVersionId ?? ""}
                  onChange={(e) => onSelectVersion(e.target.value)}
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-sm)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    padding: "0 var(--space-3)",
                    height: "36px",
                    background: "var(--bg-raised, #FFFFFF)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    minWidth: "260px",
                  }}
                >
                  <option value="">— Chọn bảng giá —</option>
                  {versionList.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.effectiveFrom})
                    </option>
                  ))}
                </select>
                {selectedVersionId && (
                  <Button
                    variant="ghost"
                    disabled={exporting}
                    onClick={handleExport}
                  >
                    {exporting ? "Đang xuất…" : "Xuất Excel"}
                  </Button>
                )}
              </div>
            )}
            {exportError && (
              <span
                role="alert"
                style={{ fontSize: "var(--text-sm)", color: "#C0392B", fontFamily: "var(--font-sans)" }}
              >
                {exportError}
              </span>
            )}
          </div>
        )}
      </Card>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tạo bảng giá mới"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <FormField
            label="Tên bảng giá"
            name="v-name"
            value={vName}
            onChange={(e) => setVName(e.target.value)}
            placeholder="VD: Giá mùa hè 2026"
          />
          <FormField
            label="Ngày hiệu lực (YYYY-MM-DD)"
            name="v-date"
            type="text"
            value={vDate}
            onChange={(e) => setVDate(e.target.value)}
            placeholder="2026-06-01"
          />
          {versionList.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <label
                htmlFor="clone-from-select"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-sm)",
                  fontWeight: "500" as React.CSSProperties["fontWeight"],
                  color: "var(--text-primary)",
                }}
              >
                Sao chép từ (tuỳ chọn)
              </label>
              <select
                id="clone-from-select"
                value={cloneFrom}
                onChange={(e) => setCloneFrom(e.target.value)}
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-sm)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  padding: "0 var(--space-3)",
                  height: "44px",
                  background: "var(--bg-raised, #FFFFFF)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                <option value="">— Không sao chép —</option>
                {versionList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.effectiveFrom})
                  </option>
                ))}
              </select>
            </div>
          )}
          {createError && (
            <span
              role="alert"
              style={{ fontSize: "var(--text-sm)", color: "#C0392B", fontFamily: "var(--font-sans)" }}
            >
              {createError}
            </span>
          )}
          <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
            <Button variant="action" disabled={creating} onClick={handleCreate}>
              {creating ? "Đang tạo…" : "Tạo bảng giá"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
};

// ── Price matrix card ──────────────────────────────────────────────────────────

interface PriceMatrixCardProps {
  api: ReturnType<typeof useAuth>["api"];
  versionId: string;
}

interface VersionWithCells extends PriceBookVersion {
  cells?: PriceCell[];
}

interface EditTarget {
  ticketTypeId: string;
  ticketTypeName: string;
  timeWindowId: string;
  timeWindowName: string;
  dayType: string;
  currentPrice: number | null;
}

const PriceMatrixCard: React.FC<PriceMatrixCardProps> = ({ api, versionId }) => {
  const qc = useQueryClient();

  const { data: timeWindows } = useQuery<TimeWindow[]>({
    queryKey: ["time-windows"],
    queryFn: () => api.get<TimeWindow[]>("/sales/pricing/time-windows"),
  });

  const { data: ticketTypes } = useQuery<TicketType[]>({
    queryKey: ["ticket-types"],
    queryFn: () => api.get<TicketType[]>("/sales/ticket-types"),
  });

  const { data: versionData, isLoading, error } = useQuery<VersionWithCells>({
    queryKey: ["pricing-version", versionId],
    queryFn: () => api.get<VersionWithCells>(`/sales/pricing/versions/${versionId}`),
    enabled: !!versionId,
  });

  const [editTarget, setEditTarget] = React.useState<EditTarget | null>(null);
  const [editPrice, setEditPrice] = React.useState("");
  const [editError, setEditError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const cells = versionData?.cells ?? [];

  const getCellPrice = (
    ticketTypeId: string,
    timeWindowId: string,
    dayType: string,
  ): number | null => {
    const cell = cells.find(
      (c) => c.ticketTypeId === ticketTypeId && c.timeWindowId === timeWindowId && c.dayType === dayType,
    );
    return cell?.priceVnd ?? null;
  };

  const openEdit = (
    tt: TicketType,
    tw: TimeWindow,
    dayType: string,
  ) => {
    const current = getCellPrice(tt.id, tw.id, dayType);
    setEditTarget({
      ticketTypeId: tt.id,
      ticketTypeName: tt.name,
      timeWindowId: tw.id,
      timeWindowName: tw.name,
      dayType,
      currentPrice: current,
    });
    setEditPrice(current !== null ? String(current) : "");
    setEditError(null);
  };

  const handleSave = async () => {
    if (!editTarget) return;
    const priceVnd = parseInt(editPrice, 10);
    if (!Number.isInteger(priceVnd) || priceVnd < 0) {
      setEditError("Giá phải là số nguyên không âm.");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await api.request(`/sales/pricing/versions/${versionId}/cells`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketTypeId: editTarget.ticketTypeId,
          timeWindowId: editTarget.timeWindowId,
          dayType: editTarget.dayType,
          priceVnd,
        }),
      });
      await qc.invalidateQueries({ queryKey: ["pricing-version", versionId] });
      setEditTarget(null);
    } catch (err) {
      setEditError(toErrorMessage(err, "Cập nhật giá thất bại"));
    } finally {
      setSaving(false);
    }
  };

  const windows = timeWindows ?? [];
  const types = (ticketTypes ?? [])
    .filter((t) => t.status === "ACTIVE" || t.status === "active")
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <>
      <Card title="Ma trận giá" description={versionData ? `Bảng giá: ${versionData.name}` : undefined}>
        {isLoading && <LoadingState />}
        {!isLoading && error && <ErrorState message={toErrorMessage(error)} />}
        {!isLoading && !error && cells.length === 0 && (
          <EmptyState text="Bảng giá này chưa có ô giá nào. Nhấn vào một ô để nhập giá." />
        )}
        {!isLoading && !error && windows.length > 0 && types.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
              }}
            >
              <thead>
                {/* Row 1: time window spanning headers */}
                <tr>
                  <th
                    rowSpan={2}
                    style={{
                      textAlign: "left",
                      padding: "var(--space-2) var(--space-3)",
                      borderBottom: "1px solid var(--border-default)",
                      borderRight: "1px solid var(--border-subtle)",
                      color: "var(--text-muted)",
                      fontSize: "var(--text-xs)",
                      fontWeight: "500" as React.CSSProperties["fontWeight"],
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                      background: "var(--bg-page, #FAF8F6)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Loại vé
                  </th>
                  {windows.map((tw) => (
                    <th
                      key={tw.id}
                      colSpan={3}
                      style={{
                        textAlign: "center",
                        padding: "var(--space-2) var(--space-3)",
                        borderBottom: "1px solid var(--border-subtle)",
                        borderLeft: "1px solid var(--border-subtle)",
                        color: "var(--text-primary)",
                        fontSize: "var(--text-xs)",
                        fontWeight: "500" as React.CSSProperties["fontWeight"],
                        background: "var(--bg-page, #FAF8F6)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tw.name}
                      <span
                        style={{ color: "var(--text-muted)", marginLeft: "var(--space-1)" }}
                      >
                        ({hhmm(tw.startMinute)}–{hhmm(tw.endMinute)})
                      </span>
                    </th>
                  ))}
                </tr>
                {/* Row 2: day-type sub-headers */}
                <tr>
                  {windows.map((tw) =>
                    DAY_TYPES.map((dt) => (
                      <th
                        key={`${tw.id}-${dt}`}
                        style={{
                          textAlign: "right",
                          padding: "var(--space-2) var(--space-3)",
                          borderBottom: "1px solid var(--border-default)",
                          borderLeft: dt === "REGULAR" ? "1px solid var(--border-subtle)" : undefined,
                          color: "var(--text-muted)",
                          fontSize: "var(--text-xs)",
                          fontWeight: "500" as React.CSSProperties["fontWeight"],
                          background: "var(--bg-page, #FAF8F6)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {DAY_TYPE_LABELS[dt]}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {types.map((tt) => (
                  <tr
                    key={tt.id}
                    style={{ transition: "background var(--dur-fast)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-page, #FAF8F6)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td
                      style={{
                        padding: "var(--space-3)",
                        borderBottom: "1px solid var(--border-subtle)",
                        borderRight: "1px solid var(--border-subtle)",
                        color: "var(--text-primary)",
                        fontWeight: "500" as React.CSSProperties["fontWeight"],
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "var(--space-2)",
                        }}
                      >
                        <span
                          style={{
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            background: tt.color || "var(--text-muted)",
                            flexShrink: 0,
                          }}
                        />
                        {tt.name}
                      </span>
                    </td>
                    {windows.map((tw) =>
                      DAY_TYPES.map((dt) => {
                        const price = getCellPrice(tt.id, tw.id, dt);
                        return (
                          <td
                            key={`${tw.id}-${dt}`}
                            title="Nhấn để chỉnh giá"
                            onClick={() => openEdit(tt, tw, dt)}
                            style={{
                              textAlign: "right",
                              padding: "var(--space-3)",
                              borderBottom: "1px solid var(--border-subtle)",
                              borderLeft: dt === "REGULAR" ? "1px solid var(--border-subtle)" : undefined,
                              color: price !== null ? "var(--text-primary)" : "var(--text-muted)",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              minWidth: "100px",
                            }}
                          >
                            {price !== null ? formatVnd(price) : "—"}
                          </td>
                        );
                      }),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editTarget && (
        <Dialog
          open
          onClose={() => setEditTarget(null)}
          title="Chỉnh giá"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                color: "var(--text-secondary)",
              }}
            >
              {editTarget.ticketTypeName} / {editTarget.timeWindowName} /{" "}
              {DAY_TYPE_LABELS[editTarget.dayType] ?? editTarget.dayType}
            </p>
            <FormField
              label="Giá (VND)"
              name="price-vnd"
              type="number"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              placeholder="VD: 150000"
            />
            {editError && (
              <span
                role="alert"
                style={{ fontSize: "var(--text-sm)", color: "#C0392B", fontFamily: "var(--font-sans)" }}
              >
                {editError}
              </span>
            )}
            <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setEditTarget(null)}>
                Hủy
              </Button>
              <Button variant="action" disabled={saving} onClick={handleSave}>
                {saving ? "Đang lưu…" : "Lưu giá"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
};

// ── PricingPage ────────────────────────────────────────────────────────────────

export const PricingPage: React.FC = () => {
  const { api } = useAuth();
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null);

  return (
    <PageStack>
      <TimeWindowCard api={api} />
      <VersionCard
        api={api}
        selectedVersionId={selectedVersionId}
        onSelectVersion={setSelectedVersionId}
      />
      {selectedVersionId && (
        <PriceMatrixCard api={api} versionId={selectedVersionId} />
      )}
    </PageStack>
  );
};
