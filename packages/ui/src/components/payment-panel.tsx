/**
 * PaymentPanel — POS payment summary shell.
 *
 * Displays order items, subtotal, and a confirm-payment CTA.
 * Shell only for M1 — actual payment logic lives in apps/pos P7.
 *
 * Touch targets ≥48px (DECISION #8). Action button uses --action-bg,
 * NOT terracotta (DECISION #1).
 *
 * DataTable deferred to reporting wave (H10).
 */

import * as React from "react";
import { Button } from "./button";

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  /** Unit price in integer VND đồng. */
  unitPrice: number;
}

export interface PaymentPanelProps {
  items: OrderItem[];
  /** Called when cashier confirms payment. */
  onConfirm?: () => void;
  /** Disable the confirm button (e.g. empty order or processing). */
  disabled?: boolean;
}

function formatVnd(amount: number): string {
  return amount.toLocaleString("vi-VN") + "₫";
}

export const PaymentPanel: React.FC<PaymentPanelProps> = ({
  items,
  onConfirm,
  disabled = false,
}) => {
  // Subtotal: sum of quantity * unitPrice — all integer đồng, no float risk.
  const subtotal = items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);

  return (
    <aside
      aria-label="Giỏ hàng"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-raised, #FFFFFF)",
        borderLeft: "1px solid var(--border-subtle)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "var(--space-4) var(--space-5)",
          borderBottom: "1px solid var(--border-subtle)",
          fontSize: "var(--text-base)",
          fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
          color: "var(--text-primary)",
        }}
      >
        Đơn hàng
      </div>

      {/* Item list */}
      <div
        style={{
          flex: "1 1 0",
          overflowY: "auto",
          padding: "var(--space-3) var(--space-5)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        {items.length === 0 ? (
          <span
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--text-muted)",
              textAlign: "center",
              paddingTop: "var(--space-6)",
            }}
          >
            Chưa có món nào
          </span>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "var(--space-3)",
                fontSize: "var(--text-sm)",
              }}
            >
              <span
                style={{
                  minWidth: "var(--touch-min, 48px)",
                  color: "var(--text-secondary)",
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                }}
              >
                {item.quantity}×
              </span>
              <span
                style={{
                  flex: 1,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.name}
              </span>
              <span
                style={{
                  color: "var(--text-secondary)",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {formatVnd(item.quantity * item.unitPrice)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Subtotal + CTA */}
      <div
        style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: "var(--space-4) var(--space-5)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "var(--text-base)",
            fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
            color: "var(--text-primary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>Tổng cộng</span>
          <span>{formatVnd(subtotal)}</span>
        </div>

        {/* Action button: uses --action-bg (lam teal), NOT terracotta — DECISION #1 */}
        <Button
          variant="action"
          touch
          disabled={disabled || items.length === 0}
          onClick={onConfirm}
          style={{ width: "100%" }}
          aria-label="Xác nhận thanh toán"
        >
          Thanh toán
        </Button>
      </div>
    </aside>
  );
};
