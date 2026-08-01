/**
 * PayDialog — two-step bill creation + payment flow.
 *
 * Step 1 (on open): POST /sales/bills → show server total + bill number.
 * Step 2: choose payment method(s), enter amounts, POST /sales/bills/:id/payments.
 *
 * Idempotency: billId is kept in state — re-opening after a partial failure
 * skips bill creation and goes straight to payment.
 *
 * VietQR: uses img.vietqr.io if branch.bankAccount is present.
 * Print: stub — console.log on success (real print agent is a separate task).
 */

import * as React from "react";
import { Dialog, Button, FormField } from "@ilikebuffet/ui";
import { usePosAuth } from "../auth/pos-auth-context";
import { usePosSession } from "../session/pos-session-context";
import { ApiError } from "../lib/pos-api-client";
import type { OrderItem } from "@ilikebuffet/ui";
import { formatVnd } from "@ilikebuffet/shared";

type PaymentMethod = "CASH" | "VIETQR" | "CARD";

interface BillLine {
  ticketTypeName: string;
  unitPriceVnd: number;
  qty: number;
  lineTotalVnd: number;
}

interface Bill {
  id: string;
  number: string;
  totalVnd: number;
  guestCount: number;
  status: string;
  lines: BillLine[];
}

interface BranchInfo {
  id: string;
  name: string;
  bankAccount?: string;
}

export interface PayDialogProps {
  open: boolean;
  onClose: () => void;
  cartItems: OrderItem[];
  clientUuid: string;
  onPaymentSuccess: () => void;
}

type Step = "creating" | "choose-method" | "paying" | "success" | "error";

export const PayDialog: React.FC<PayDialogProps> = ({
  open,
  onClose,
  cartItems,
  clientUuid,
  onPaymentSuccess,
}) => {
  const { api, selectedBranchId } = usePosAuth();
  const { deviceId, shiftId } = usePosSession();

  // Persist billId across re-renders so retry skips creation.
  const [billId, setBillId] = React.useState<string | null>(null);
  const [bill, setBill] = React.useState<Bill | null>(null);
  const [branch, setBranch] = React.useState<BranchInfo | null>(null);
  const [step, setStep] = React.useState<Step>("creating");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const [method, setMethod] = React.useState<PaymentMethod>("CASH");
  const [amountInput, setAmountInput] = React.useState("");

  // Reset state when dialog is opened with fresh cart (clientUuid change = new sale).
  const prevClientUuidRef = React.useRef<string>("");
  React.useEffect(() => {
    if (open && clientUuid !== prevClientUuidRef.current) {
      prevClientUuidRef.current = clientUuid;
      setBillId(null);
      setBill(null);
      setStep("creating");
      setErrorMsg(null);
      setAmountInput("");
    }
  }, [open, clientUuid]);

  // On open: fetch branch info + create bill (unless already created).
  React.useEffect(() => {
    if (!open) return;
    if (bill) {
      // Already created — go straight to payment step.
      setStep("choose-method");
      return;
    }

    let cancelled = false;

    async function createBill() {
      if (!selectedBranchId || !shiftId) {
        setErrorMsg("Thiếu thông tin chi nhánh hoặc ca làm việc");
        setStep("error");
        return;
      }

      try {
        // Fetch branch info for VietQR (fire concurrently with bill creation).
        const [billResult, branchResult] = await Promise.all([
          api.post<Bill>("/sales/bills", {
            branchId: selectedBranchId,
            deviceId,
            shiftId,
            lines: cartItems.map((item) => ({
              ticketTypeId: item.id,
              qty: item.quantity,
            })),
            clientUuid,
          }),
          api.get<{ data: BranchInfo[] }>("/branches").then((res) => {
            const list = Array.isArray(res) ? res : res.data ?? [];
            return list.find((b: BranchInfo) => b.id === selectedBranchId) ?? null;
          }).catch(() => null),
        ]);

        if (cancelled) return;
        setBillId(billResult.id);
        setBill(billResult);
        setBranch(branchResult);
        setAmountInput(String(billResult.totalVnd));
        setStep("choose-method");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(
          err instanceof ApiError
            ? `Không tạo được bill: ${err.message}`
            : "Lỗi kết nối — thử lại",
        );
        setStep("error");
      }
    }

    void createBill();
    return () => {
      cancelled = true;
    };
  }, [open]); // intentionally omits stable refs: api, selectedBranchId, deviceId, shiftId, cartItems, clientUuid are captured at open-time

  const handleConfirmPayment = React.useCallback(async () => {
    if (!billId || !bill) return;
    const amountVnd = parseInt(amountInput, 10);
    if (amountVnd !== bill.totalVnd) return; // Button should be disabled, guard anyway.

    setStep("paying");
    try {
      await api.request<unknown>(`/sales/bills/${billId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payments: [{ method, amountVnd, reference: undefined }],
        }),
      });
      console.log("[PayDialog] payment success", { billId, bill, method, amountVnd });
      setStep("success");
      onPaymentSuccess();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? `Thanh toán thất bại: ${err.message}`
          : "Lỗi kết nối — thử lại",
      );
      setStep("error");
    }
  }, [api, bill, billId, amountInput, method, onPaymentSuccess]);

  const remaining = bill ? bill.totalVnd - (parseInt(amountInput, 10) || 0) : 0;
  const payDisabled =
    step === "paying" || !bill || parseInt(amountInput, 10) !== bill.totalVnd;

  function renderContent() {
    if (step === "creating") {
      return (
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
          Đang tạo bill…
        </p>
      );
    }

    if (step === "error") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <p
            role="alert"
            style={{ color: "#C0392B", fontSize: "var(--text-sm)", margin: 0 }}
          >
            {errorMsg}
          </p>
          <Button variant="ghost" touch onClick={onClose} style={{ width: "100%" }}>
            Đóng
          </Button>
        </div>
      );
    }

    if (step === "success" && bill) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-base)", color: "var(--text-primary)" }}>
            Thanh toán thành công — Bill #{bill.number}
          </p>
          <Button
            variant="ghost"
            touch
            onClick={() => console.log("[PayDialog] print stub", bill)}
            style={{ width: "100%" }}
          >
            In bill
          </Button>
          <Button variant="action" touch onClick={onClose} style={{ width: "100%" }}>
            Đóng
          </Button>
        </div>
      );
    }

    if (!bill) return null;

    // Payment step
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* Server-authoritative total */}
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            background: "var(--bg-sunken)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "var(--text-sm)",
              color: "var(--text-secondary)",
              marginBottom: "var(--space-1)",
            }}
          >
            <span>Bill #{bill.number}</span>
            <span>{bill.guestCount} khách</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "var(--text-base)",
              fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              color: "var(--text-primary)",
            }}
          >
            <span>Tổng cộng</span>
            <span>{formatVnd(bill.totalVnd)}</span>
          </div>
        </div>

        {/* Payment method selector */}
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {(["CASH", "VIETQR", "CARD"] as PaymentMethod[]).map((m) => (
            <Button
              key={m}
              variant={method === m ? "action" : "ghost"}
              touch
              onClick={() => {
                setMethod(m);
                if (m !== "VIETQR") setAmountInput(String(bill.totalVnd));
              }}
              style={{ flex: 1, fontSize: "var(--text-xs)" }}
              aria-pressed={method === m}
            >
              {m === "CASH" ? "Tiền mặt" : m === "VIETQR" ? "VietQR" : "Thẻ"}
            </Button>
          ))}
        </div>

        {/* VietQR image */}
        {method === "VIETQR" && (() => {
          const parts = (branch?.bankAccount ?? "").split("-");
          // Expect format: "BANKCODE-ACCOUNT" e.g. "VCB-0123456789"
          if (parts.length >= 2 && parts[0] && parts[1]) {
            const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(parts[0])}-${encodeURIComponent(parts.slice(1).join("-"))}-compact2.png?amount=${bill.totalVnd}&addInfo=${encodeURIComponent(bill.number)}`;
            return (
              <div style={{ textAlign: "center" }}>
                <img
                  src={qrUrl}
                  alt={`VietQR ${formatVnd(bill.totalVnd)}`}
                  style={{ maxWidth: "200px", borderRadius: "var(--radius-sm)" }}
                />
              </div>
            );
          }
          return (
            <div
              style={{
                border: "2px dashed var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-6)",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "var(--text-sm)",
              }}
            >
              <div>{formatVnd(bill.totalVnd)}</div>
              <div style={{ marginTop: "var(--space-2)" }}>Quét VietQR</div>
            </div>
          );
        })()}

        {/* Amount input */}
        <FormField
          label="Số tiền nhận"
          type="number"
          touch
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          name="payment-amount"
          autoComplete="off"
          error={
            amountInput && parseInt(amountInput, 10) !== bill.totalVnd
              ? `Còn thiếu: ${formatVnd(Math.abs(remaining))}`
              : undefined
          }
        />

        <Button
          variant="action"
          touch
          disabled={payDisabled}
          onClick={handleConfirmPayment}
          style={{ width: "100%" }}
          aria-label="Xác nhận thanh toán"
        >
          {step === "paying" ? "Đang xử lý…" : "Xác nhận thanh toán"}
        </Button>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Thanh toán"
      touch
    >
      {renderContent()}
    </Dialog>
  );
};
