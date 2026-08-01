/**
 * Button — ilikebuffet UI primitive
 *
 * Variants:
 *   action  — primary CTA. Uses --action-bg (lam teal), NOT terracotta. DECISION #1.
 *   ghost   — outline/text, low emphasis.
 *   danger  — destructive actions. Uses a red-adjacent tone distinct from action.
 *   link    — text-only, inline.
 *
 * Touch target: ops tier enforces min 48×48px via `touch` prop (DECISION #8).
 *
 * No snapshot tests on color. Token-conformance is enforced by the
 * no-terracotta-action eslint rule + the touch-size behavior test.
 */

import * as React from "react";

export type ButtonVariant = "action" | "ghost" | "danger" | "link";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Ops/POS touch tier — enforces 48×48px minimum (DECISION #8). */
  touch?: boolean;
  children: React.ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  action: {
    background: "var(--action-bg)",
    color: "var(--action-text)",
    border: "none",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
  },
  danger: {
    /* Danger uses a distinct red — explicitly not terracotta to prevent
       confusion with brand color. DECISION #1 rationale. */
    background: "#C0392B",
    color: "#FFFFFF",
    border: "none",
  },
  link: {
    background: "transparent",
    color: "var(--action-bg)",
    border: "none",
    padding: "0",
    height: "auto",
    minHeight: "0",
    textDecoration: "underline",
  },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "action", touch = false, children, style, ...rest }, ref) => {
    const baseStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
      lineHeight: 1,
      borderRadius: "var(--radius-md)",
      cursor: "pointer",
      transition: `background var(--dur-fast) var(--ease-calm), opacity var(--dur-fast)`,
      outline: "none",
      /* Default sizing: comfortable for office tier */
      height: "36px",
      minHeight: "36px",
      minWidth: "36px",
      padding: "0 var(--space-4)",
      gap: "var(--space-2)",
      ...VARIANT_STYLES[variant],
      /* Ops/POS touch tier: 48px minimum (DECISION #8) */
      ...(touch
        ? {
            height: "var(--touch-min, 48px)",
            minHeight: "var(--touch-min, 48px)",
            minWidth: "var(--touch-min, 48px)",
            fontSize: "var(--text-base)",
            padding: "0 var(--space-5)",
          }
        : {}),
      ...style,
    };

    return (
      <button
        ref={ref}
        data-variant={variant}
        data-touch={touch ? "true" : undefined}
        style={baseStyle}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
