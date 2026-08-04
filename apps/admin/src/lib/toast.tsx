/**
 * Toast — lightweight, app-wide notifications for action feedback.
 *
 * A module-level store (same pattern as theme.tsx) so both React components
 * (`<Toaster/>`) and non-React code (the queryClient MutationCache in app.tsx)
 * can push toasts. Success is announced politely; errors use role="alert".
 * Colours come from design tokens, so toasts look right in light and dark themes.
 */
import * as React from "react";

export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const AUTO_DISMISS_MS = 4000;

let _toasts: Toast[] = [];
let _nextId = 1;
const _listeners = new Set<() => void>();

function emit() {
  for (const fn of _listeners) fn();
}

function push(kind: ToastKind, message: string): number {
  const id = _nextId++;
  _toasts = [..._toasts, { id, kind, message }];
  emit();
  if (typeof window !== "undefined") {
    window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }
  return id;
}

export function dismiss(id: number): void {
  _toasts = _toasts.filter((t) => t.id !== id);
  emit();
}

/** Imperative API — callable from anywhere (components, mutation callbacks). */
export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
};

function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
const getSnapshot = () => _toasts;

/** Current toast list (subscribes to the store). */
export function useToasts(): Toast[] {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── UI ──────────────────────────────────────────────────────────────────────

const KIND_ACCENT: Record<ToastKind, string> = {
  success: "var(--accent-strong, #2F7168)",
  error: "#C0392B",
  info: "var(--text-secondary)",
};

const ICONS: Record<ToastKind, string> = {
  success: "M20 6L9 17l-5-5",
  error: "M12 8v5M12 16h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 16v-5M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
};

/** Fixed toast stack (top-right, safe-area aware). Mount once near the app root. */
export const Toaster: React.FC = () => {
  const toasts = useToasts();
  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        top: "max(var(--space-4), env(safe-area-inset-top))",
        right: "max(var(--space-4), env(safe-area-inset-right))",
        left: "auto",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        maxWidth: "min(360px, calc(100vw - var(--space-6)))",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          style={{
            pointerEvents: "auto",
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-2)",
            padding: "var(--space-3)",
            background: "var(--bg-raised, #FFFFFF)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
            borderLeft: `3px solid ${KIND_ACCENT[t.kind]}`,
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={KIND_ACCENT[t.kind]} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }} aria-hidden="true">
            <path d={ICONS[t.kind]} />
          </svg>
          <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Đóng thông báo"
            style={{ flexShrink: 0, width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
};
