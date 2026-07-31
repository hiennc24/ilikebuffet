/**
 * PinLockScreen — lock screen / PIN re-entry stub (P5 shell).
 *
 * Wired to POST /auth/pin-login via usePosAuth().pinLogin().
 * Full offline PIN support and device registration are deferred to P8.
 *
 * Touch tier: all targets ≥48px (DECISION #8).
 */

import * as React from "react";
import { Button } from "@ilikebuffet/ui";
import { usePosAuth } from "./pos-auth-context";

const PIN_LENGTH = 6;

export const PinLockScreen: React.FC = () => {
  const { pinLogin, error, loading } = usePosAuth();
  const [digits, setDigits] = React.useState<string[]>([]);

  const entered = digits.join("");

  const handleDigit = (d: string) => {
    if (digits.length >= PIN_LENGTH) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length === PIN_LENGTH) {
      void pinLogin(next.join(""));
      setDigits([]);
    }
  };

  const handleBackspace = () => setDigits((prev) => prev.slice(0, -1));

  const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-page, #FAF8F6)",
        gap: "var(--space-6)",
        padding: "var(--space-6)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <strong style={{ fontSize: "var(--text-md)" }}>Nhập mã PIN</strong>

      {/* PIN dots */}
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            style={{
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              border: `2px solid ${i < entered.length ? "var(--action-bg, #235B54)" : "var(--border-default)"}`,
              background: i < entered.length ? "var(--action-bg, #235B54)" : "transparent",
              transition: "background var(--dur-fast), border-color var(--dur-fast)",
            }}
          />
        ))}
      </div>

      {error && (
        <span role="alert" style={{ fontSize: "var(--text-sm)", color: "#C0392B" }}>
          {error}
        </span>
      )}

      {loading && (
        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
          Đang xác thực…
        </span>
      )}

      {/* Numpad grid — all buttons ≥48px (DECISION #8) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, var(--touch-min, 48px))",
          gap: "var(--space-3)",
        }}
      >
        {PAD.map((key, i) => {
          if (key === "") {
            return <span key={i} />;
          }
          if (key === "⌫") {
            return (
              <button
                key={i}
                type="button"
                onClick={handleBackspace}
                aria-label="Xoá"
                style={{
                  width: "var(--touch-min, 48px)",
                  height: "var(--touch-min, 48px)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-raised, #FFFFFF)",
                  cursor: "pointer",
                  fontSize: "var(--text-base)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {key}
              </button>
            );
          }
          return (
            <Button
              key={i}
              variant="ghost"
              touch
              onClick={() => handleDigit(key)}
              aria-label={key}
              style={{
                width: "var(--touch-min, 48px)",
                fontSize: "var(--text-md)",
                fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              }}
            >
              {key}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
