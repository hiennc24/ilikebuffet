/**
 * PayDialog — two-step bill creation + payment flow.
 *
 * Step 1 (on open): POST /sales/bills → show server total + bill number.
 * Step 2: choose payment method, confirm payment.
 *
 * Idempotency: billId is kept in state — re-opening after a partial failure
 * skips bill creation and goes straight to payment.
 *
 * VietQR: uses img.vietqr.io if branch.bankAccount is present.
 * Print: delegated to print-client (real print agent).
 *
 * Cash over-tender: when method=CASH, cashier may enter a tendered amount
 * greater than the bill total. Change is shown in the UI; tenderedVnd is
 * forwarded to the server (online) and stored in the outbox (offline).
 */

import * as React from "react";
import { Dialog, Button, FormField } from "@ilikebuffet/ui";
import { usePosAuth } from "../auth/pos-auth-context";
import { usePosSession } from "../session/pos-session-context";
import { useNetworkStatus } from "../offline/network-status-context";
import { addToOutbox, buildTempNumber } from "../offline/outbox-store";
import { printBill, type PrintBillPayload } from "../offline/print-client";
import { ApiError } from "../lib/pos-api-client";
import type { OrderItem } from "@ilikebuffet/ui";
import { formatVnd, multiplyVnd } from "@ilikebuffet/shared";

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
  code?: string;
  bankAccount?: string;
}

/** localStorage key caching the branch code for offline temp-number prefixes. */
const BRANCH_CODE_KEY = "ibb_pos_branch_code";

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
  const { isOnline, clockSkew, triggerSync } = useNetworkStatus();

  // Persist billId across re-renders so retry skips creation.
  const [billId, setBillId] = React.useState<string | null>(null);
  const [bill, setBill] = React.useState<Bill | null>(null);
  const [branch, setBranch] = React.useState<BranchInfo | null>(null);
  const [step, setStep] = React.useState<Step>("creating");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  // True when the bill was created offline (no server number yet).
  const [isOfflineBill, setIsOfflineBill] = React.useState(false);
  // Offline bill metadata captured at creation, used to write the outbox row at
  // payment confirmation (a bill only enters the outbox once it is paid).
  const offlineMetaRef = React.useRef<{ tempNumber: string; createdAt: string; clockOffsetMs: number } | null>(null);
  // Synchronous re-entry guard so a double-tap on "Xác nhận thanh toán" cannot
  // submit twice before React re-renders and disables the button (CR-3).
  const submittingRef = React.useRef(false);

  const [method, setMethod] = React.useState<PaymentMethod>("CASH");
  const [amountInput, setAmountInput] = React.useState("");
  // Cash over-tender: how much the customer hands over (CASH only).
  const [tenderedInput, setTenderedInput] = React.useState("");

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
      setTenderedInput("");
      setIsOfflineBill(false);
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

      // ── Offline path: queue the bill to the outbox instead of POSTing.
      // Covers the "network drops mid-shift" case — the catalog/prices were
      // loaded while online, so the cart carries unit prices for a local estimate;
      // the server recomputes the authoritative total + gapless number on sync.
      if (!isOnline) {
        // Block when clock skew is confirmed exceeded.
        if (clockSkew?.exceeded) {
          setErrorMsg("Đồng hồ thiết bị lệch giờ — chỉnh lại giờ trước khi bán offline.");
          setStep("error");
          return;
        }
        // Warn (non-blocking) when skew has never been measured (e.g. device
        // booted without network). The cashier can proceed, but is informed.
        if (clockSkew === null) {
          // A real warning overlay would be ideal; for now surface via errorMsg
          // on a non-blocking notice — we let the flow continue rather than
          // blocking, matching the product decision that a "never measured"
          // skew is less risky than losing a sale.
          console.warn("[POS] Clock skew not yet measured — proceeding offline with unverified clock.");
        }
        const nowIso = new Date().toISOString();
        const branchCode = localStorage.getItem(BRANCH_CODE_KEY) ?? "CN";
        const tempNumber = buildTempNumber(branchCode, deviceId, selectedBranchId, new Date(nowIso));
        const estTotal = cartItems.reduce((s, i) => s + multiplyVnd(i.unitPrice, i.quantity), 0);
        const guest = cartItems.reduce((s, i) => s + i.quantity, 0);
        // The bill enters the outbox only once paid (see handleConfirmPayment).
        offlineMetaRef.current = { tempNumber, createdAt: nowIso, clockOffsetMs: clockSkew?.offsetMs ?? 0 };
        if (cancelled) return;
        setBillId(clientUuid);
        setBill({
          id: clientUuid,
          number: tempNumber,
          totalVnd: estTotal,
          guestCount: guest,
          status: "OFFLINE_PENDING",
          lines: cartItems.map((i) => ({
            ticketTypeName: i.name,
            unitPriceVnd: i.unitPrice,
            qty: i.quantity,
            lineTotalVnd: multiplyVnd(i.unitPrice, i.quantity),
          })),
        });
        setIsOfflineBill(true);
        setAmountInput(String(estTotal));
        setTenderedInput(String(estTotal));
        setStep("choose-method");
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
        // Cache the branch code so offline temp numbers use the right prefix.
        if (branchResult?.code) localStorage.setItem(BRANCH_CODE_KEY, branchResult.code);
        setBillId(billResult.id);
        setBill(billResult);
        setBranch(branchResult);
        setAmountInput(String(billResult.totalVnd));
        setTenderedInput(String(billResult.totalVnd));
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
    if (submittingRef.current || !billId || !bill) return;
    const amountVnd = parseInt(amountInput, 10);
    if (amountVnd !== bill.totalVnd) return; // Button should be disabled, guard anyway.

    // For CASH, resolve the tendered amount (integer VND). Falls back to
    // amountVnd if the cashier left the field blank or at the exact total.
    const parsedTendered = parseInt(tenderedInput, 10);
    const tenderedVnd = method === "CASH" && Number.isFinite(parsedTendered) && parsedTendered >= amountVnd
      ? parsedTendered
      : undefined;

    submittingRef.current = true;
    setStep("paying"); // disables the button once React re-renders
    try {
      // Offline: write the completed bill (with its payment) to the outbox now.
      // There is no server to POST to; the sale is settled locally and the bill —
      // including the payment method taken — syncs on reconnect.
      if (isOfflineBill) {
        const meta = offlineMetaRef.current;
        if (!meta || !selectedBranchId || !shiftId) {
          setErrorMsg("Thiếu dữ liệu bill offline — thử lại.");
          setStep("error");
          return;
        }
        try {
          await addToOutbox({
            clientUuid: billId,
            tempNumber: meta.tempNumber,
            branchId: selectedBranchId,
            shiftId,
            deviceId,
            createdAt: meta.createdAt,
            deviceClockAt: meta.createdAt,
            clockOffsetMs: meta.clockOffsetMs,
            lines: cartItems.map((i) => ({ ticketTypeId: i.id, qty: i.quantity })),
            payments: [{ method, amountVnd, ...(tenderedVnd !== undefined ? { tenderedVnd } : {}) }],
          });
        } catch (err) {
          // A duplicate clientUuid (Dexie ConstraintError) means a prior tap
          // already queued this bill — the sale is settled, so treat it as
          // success rather than showing an error on a paid bill (CR-3).
          if (!(err instanceof Error && err.name === "ConstraintError")) {
            setErrorMsg("Không lưu được bill offline — thử lại.");
            setStep("error");
            return;
          }
        }
        setStep("success");
        onPaymentSuccess();
        triggerSync(); // no-op while offline; drains the outbox once back online
        return;
      }

      try {
        await api.request<unknown>(`/sales/bills/${billId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payments: [{ method, amountVnd, reference: undefined, ...(tenderedVnd !== undefined ? { tenderedVnd } : {}) }],
          }),
        });
        setStep("success");
        onPaymentSuccess();
      } catch (err) {
        // 409 = the bill is already paid — VietQR auto-reconcile (or a prior tap)
        // settled it server-side. Treat as success, not an error.
        if (err instanceof ApiError && err.status === 409) {
          setStep("success");
          onPaymentSuccess();
          return;
        }
        setErrorMsg(
          err instanceof ApiError
            ? `Thanh toán thất bại: ${err.message}`
            : "Lỗi kết nối — thử lại",
        );
        setStep("error");
      }
    } finally {
      submittingRef.current = false;
    }
  }, [api, bill, billId, amountInput, tenderedInput, method, onPaymentSuccess, isOfflineBill, triggerSync, cartItems, selectedBranchId, shiftId, deviceId]);

  // While the VietQR QR is on screen, poll for server-side auto-reconciliation:
  // when the Sepay webhook confirms the transfer, the bill's paidAt is set and we
  // auto-advance to success — the cashier doesn't have to tap confirm.
  React.useEffect(() => {
    if (step !== "choose-method" || method !== "VIETQR" || !billId || isOfflineBill) return;
    let stopped = false;
    const timer = setInterval(async () => {
      if (stopped || submittingRef.current) return;
      try {
        const b = await api.get<{ paidAt: string | null }>(`/sales/bills/${billId}`);
        if (b.paidAt && !stopped) {
          stopped = true;
          clearInterval(timer);
          setStep("success");
          onPaymentSuccess();
        }
      } catch {
        // Transient (offline blip, etc.) — keep polling.
      }
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [step, method, billId, isOfflineBill, api, onPaymentSuccess]);

  // Build the print-agent payload from the current bill (null until priced).
  const buildPrintPayload = React.useCallback(
    (isReprint = false): PrintBillPayload | null => {
      if (!bill) return null;
      return {
        branchName: branch?.name ?? "ilikebuffet",
        billNumber: bill.number,
        createdAt: offlineMetaRef.current?.createdAt ?? new Date().toISOString(),
        lines: bill.lines.map((l) => ({
          name: l.ticketTypeName,
          qty: l.qty,
          unitPriceVnd: l.unitPriceVnd,
          lineTotalVnd: l.lineTotalVnd,
        })),
        totalVnd: bill.totalVnd,
        guestCount: bill.guestCount,
        payments: [{ method, amountVnd: bill.totalVnd }],
        isReprint,
      };
    },
    [bill, branch, method],
  );

  // Auto-print once the sale is settled. Print failure is non-fatal.
  React.useEffect(() => {
    if (step !== "success") return;
    const payload = buildPrintPayload();
    if (payload) void printBill(payload);
  }, [step, buildPrintPayload]);

  const remaining = bill ? bill.totalVnd - (parseInt(amountInput, 10) || 0) : 0;
  const payDisabled =
    step === "paying" || !bill || parseInt(amountInput, 10) !== bill.totalVnd
    || (method === "CASH" && (parseInt(tenderedInput, 10) || 0) < bill.totalVnd);

  // Computed change for cash over-tender display.
  const parsedTendered = parseInt(tenderedInput, 10);
  const changeVnd = bill && method === "CASH" && Number.isFinite(parsedTendered) && parsedTendered >= bill.totalVnd
    ? parsedTendered - bill.totalVnd
    : null;

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
            {isOfflineBill
              ? `Đã lưu bill offline #${bill.number} — sẽ đồng bộ khi có mạng`
              : `Thanh toán thành công — Bill #${bill.number}`}
          </p>
          <Button
            variant="ghost"
            touch
            onClick={() => {
              // Reprint stamps a "BẢN SAO" (copy) banner.
              const payload = buildPrintPayload(true);
              if (payload) void printBill(payload);
            }}
            style={{ width: "100%" }}
          >
            In lại bill
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
        {/* Clock-not-verified warning (non-blocking, shown only offline + never measured) */}
        {!isOnline && clockSkew === null && (
          <p
            role="status"
            style={{
              margin: 0,
              padding: "var(--space-2) var(--space-3)",
              background: "var(--color-warning-bg, #FFF8E1)",
              borderLeft: "3px solid var(--color-warning, #F59E0B)",
              fontSize: "var(--text-xs)",
              color: "var(--text-secondary)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            Chưa kiểm tra đồng hồ thiết bị — tiếp tục với cảnh báo.
          </p>
        )}

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
                if (m !== "VIETQR") {
                  setAmountInput(String(bill.totalVnd));
                  setTenderedInput(String(bill.totalVnd));
                }
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
                <div style={{ marginTop: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  Khách quét mã để chuyển khoản — tự động xác nhận khi nhận được tiền.
                </div>
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

        {/* Amount input (non-CASH: exact-match to total) */}
        {method !== "CASH" && (
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
        )}

        {/* Cash over-tender: tiền khách đưa + tiền thối */}
        {method === "CASH" && (
          <>
            <FormField
              label="Tiền khách đưa"
              type="number"
              touch
              value={tenderedInput}
              onChange={(e) => setTenderedInput(e.target.value)}
              name="cash-tendered"
              autoComplete="off"
              error={
                tenderedInput && (parseInt(tenderedInput, 10) || 0) < bill.totalVnd
                  ? `Thiếu: ${formatVnd(bill.totalVnd - (parseInt(tenderedInput, 10) || 0))}`
                  : undefined
              }
            />
            {changeVnd !== null && changeVnd > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "var(--text-sm)",
                  color: "var(--text-secondary)",
                  padding: "var(--space-1) 0",
                }}
              >
                <span>Tiền thối</span>
                <span style={{ fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"], color: "var(--text-primary)" }}>
                  {formatVnd(changeVnd)}
                </span>
              </div>
            )}
          </>
        )}

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
