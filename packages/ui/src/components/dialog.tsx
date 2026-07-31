/**
 * Dialog — modal overlay for confirmations and short forms.
 *
 * Built on the native <dialog> element for accessible focus-trap and
 * Escape-key handling without a Radix dependency on this primitive.
 *
 * Usage:
 *   <Dialog open={open} onClose={() => setOpen(false)} title="Xác nhận">
 *     <p>Bạn có chắc không?</p>
 *     <Button onClick={() => setOpen(false)}>OK</Button>
 *   </Dialog>
 */

import * as React from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Ops/POS touch tier — larger close target (DECISION #8). */
  touch?: boolean;
}

export const Dialog: React.FC<DialogProps> = ({ open, onClose, title, children, touch = false }) => {
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // Sync native close event (Escape key) back to caller.
  React.useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("close", handler);
    return () => el.removeEventListener("close", handler);
  }, [onClose]);

  const closeSize = touch ? "var(--touch-min, 48px)" : "32px";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="dialog-title"
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        padding: 0,
        boxShadow: "var(--shadow-lg)",
        background: "var(--bg-raised, #FFFFFF)",
        maxWidth: "480px",
        width: "calc(100vw - var(--space-6))",
      }}
    >
      {/* Backdrop click-to-close */}
      <form method="dialog" style={{ display: "contents" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--space-4) var(--space-5)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span
            id="dialog-title"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-base)",
              fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              color: "var(--text-primary)",
            }}
          >
            {title}
          </span>
          <button
            aria-label="Đóng"
            value="cancel"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: closeSize,
              height: closeSize,
              minWidth: closeSize,
              minHeight: closeSize,
              border: "none",
              background: "transparent",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--text-secondary)",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </form>

      <div style={{ padding: "var(--space-5)" }}>{children}</div>
    </dialog>
  );
};
