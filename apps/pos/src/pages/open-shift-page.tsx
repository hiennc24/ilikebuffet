/**
 * OpenShiftPage — cashier opens a shift before selling.
 *
 * Collects opening cash amount, calls session.openShift(), navigates to /sell
 * on success. Touch-tier FormField + Button (DECISION #8).
 */

import * as React from "react";
import { FormField, Button } from "@ilikebuffet/ui";
import { usePosSession } from "../session/pos-session-context";
import { ApiError } from "../lib/pos-api-client";

export const OpenShiftPage: React.FC = () => {
  const session = usePosSession();
  const [cashInput, setCashInput] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handleOpen = React.useCallback(async () => {
    const cashVnd = parseInt(cashInput, 10);
    if (!Number.isFinite(cashVnd) || cashVnd < 0) {
      setError("Vui lòng nhập số tiền mặt hợp lệ (≥ 0)");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await session.openShift(cashVnd);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Không thể mở ca: ${err.message}`
          : "Lỗi kết nối — thử lại",
      );
    } finally {
      setLoading(false);
    }
  }, [cashInput, session]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "var(--space-6)",
        background: "var(--bg-page, #FAF8F6)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "var(--bg-raised, #FFFFFF)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-5)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-lg)",
            fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
            color: "var(--text-primary)",
          }}
        >
          Mở ca bán hàng
        </h1>

        <FormField
          label="Tiền mặt đầu ca (đồng)"
          type="number"
          touch
          value={cashInput}
          placeholder="0"
          onChange={(e) => setCashInput(e.target.value)}
          error={error ?? undefined}
          name="opening-cash"
          autoComplete="off"
        />

        <Button
          variant="action"
          touch
          disabled={loading}
          onClick={handleOpen}
          style={{ width: "100%" }}
          aria-label="Mở ca"
        >
          {loading ? "Đang mở ca…" : "Mở ca"}
        </Button>
      </div>
    </div>
  );
};
