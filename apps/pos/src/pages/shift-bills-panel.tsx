/**
 * ShiftBillsPanel — lists the bills of the current shift and lets the cashier
 * cancel a COMPLETED bill. Cancellation is server-guarded: it requires
 * a QUAN_LY_CN approval PIN and only succeeds for a bill in THIS device's OPEN
 * shift (IDOR guard). The number is retained on the server (no gap).
 */

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, Button, FormField } from "@ilikebuffet/ui";
import { formatVnd } from "@ilikebuffet/shared";
import { usePosAuth } from "../auth/pos-auth-context";
import { usePosSession } from "../session/pos-session-context";
import { ApiError } from "../lib/pos-api-client";

interface BillRow {
  id: string;
  number: string;
  totalVnd: number;
  status: "COMPLETED" | "CANCELLED";
  createdAt: string;
}

export interface ShiftBillsPanelProps {
  open: boolean;
  onClose: () => void;
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
}

export const ShiftBillsPanel: React.FC<ShiftBillsPanelProps> = ({ open, onClose }) => {
  const { api } = usePosAuth();
  const { shiftId, deviceId } = usePosSession();
  const qc = useQueryClient();

  const { data: bills = [], isLoading, error } = useQuery({
    queryKey: ["shift-bills", shiftId],
    queryFn: () => api.get<BillRow[]>(`/sales/bills?shiftId=${shiftId}`),
    enabled: open && !!shiftId,
  });

  // Which bill is being cancelled (null = none).
  const [cancelling, setCancelling] = React.useState<BillRow | null>(null);
  const [reason, setReason] = React.useState("");
  const [managerId, setManagerId] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const resetCancel = () => {
    setCancelling(null);
    setReason("");
    setManagerId("");
    setPin("");
    setCancelError(null);
  };

  const submitCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    setCancelError(null);
    try {
      await api.request(`/sales/bills/${cancelling.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, managerId, pin, deviceId }),
      });
      await qc.invalidateQueries({ queryKey: ["shift-bills", shiftId] });
      resetCancel();
    } catch (err) {
      setCancelError(
        err instanceof ApiError
          ? err.status === 403
            ? "Hủy bị từ chối: PIN quản lý sai hoặc bill không thuộc ca này."
            : `Hủy thất bại (${err.status})`
          : "Lỗi kết nối",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Bill trong ca" touch>
      {isLoading && <p style={{ color: "var(--text-muted)" }}>Đang tải…</p>}
      {error && (
        <p role="alert" style={{ color: "#C0392B" }}>
          Không tải được danh sách bill.
        </p>
      )}
      {!isLoading && !error && bills.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>Chưa có bill nào trong ca.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxHeight: "50vh", overflowY: "auto" }}>
        {bills.map((b) => {
          const cancelled = b.status === "CANCELLED";
          return (
            <div
              key={b.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-3)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                opacity: cancelled ? 0.6 : 1,
                fontFamily: "var(--font-sans)",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"] }}>
                  {b.number}
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  {timeOf(b.createdAt)} · {formatVnd(b.totalVnd)}
                  {cancelled && " · Đã hủy"}
                </div>
              </div>
              {!cancelled && (
                <Button variant="danger" touch onClick={() => { resetCancel(); setCancelling(b); }}>
                  Hủy
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Cancel confirmation with manager PIN */}
      {cancelling && (
        <div
          style={{
            marginTop: "var(--space-4)",
            paddingTop: "var(--space-4)",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <strong style={{ fontFamily: "var(--font-sans)" }}>Hủy bill {cancelling.number}</strong>
          <FormField label="Lý do hủy" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} touch />
          <FormField label="Mã quản lý (QUAN_LY_CN)" name="managerId" value={managerId} onChange={(e) => setManagerId(e.target.value)} touch />
          <FormField label="PIN quản lý" name="pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} touch />
          {cancelError && (
            <span role="alert" style={{ color: "#C0392B", fontSize: "var(--text-sm)" }}>
              {cancelError}
            </span>
          )}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button
              variant="danger"
              touch
              disabled={busy || !reason || !managerId || !pin}
              onClick={submitCancel}
              style={{ flex: 1 }}
            >
              {busy ? "Đang hủy…" : "Xác nhận hủy"}
            </Button>
            <Button variant="ghost" touch onClick={resetCancel} style={{ flex: 1 }}>
              Bỏ qua
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
};
