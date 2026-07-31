/**
 * FormField — label + text/number input + error message.
 *
 * Single control set for M1 screens. Matches the admin login mockup
 * (SC-HT-01): 44px input height, border-focus ring from --input-focus-ring.
 *
 * Touch prop enlarges input to 48px for POS tier (DECISION #8).
 */

import * as React from "react";

export interface FormFieldProps {
  id?: string;
  label: string;
  type?: "text" | "password" | "number" | "email" | "tel";
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  /** Ops/POS touch tier — 48px minimum (DECISION #8). */
  touch?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  name?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Suffix element rendered inside the input (e.g. show/hide password toggle). */
  suffix?: React.ReactNode;
}

export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  (
    {
      id: idProp,
      label,
      type = "text",
      value,
      defaultValue,
      placeholder,
      error,
      touch = false,
      disabled = false,
      autoComplete,
      onChange,
      onBlur,
      name,
      inputRef,
      suffix,
    },
    ref,
  ) => {
    const id = idProp ?? `field-${name ?? label.replace(/\s+/g, "-").toLowerCase()}`;
    const errorId = `${id}-error`;

    const inputHeight = touch ? "var(--touch-min, 48px)" : "var(--input-height, 44px)";

    const containerStyle: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      height: inputHeight,
      padding: suffix ? "0 var(--space-2) 0 var(--space-4)" : "0 var(--space-4)",
      border: `1px solid ${error ? "#C0392B" : "var(--input-border, #E7E2DC)"}`,
      borderRadius: "var(--radius-md)",
      background: disabled ? "var(--bg-sunken)" : "var(--bg-raised, #FFFFFF)",
      transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
    };

    const inputStyle: React.CSSProperties = {
      flex: 1,
      minWidth: 0,
      height: "100%",
      border: "none",
      outline: "none",
      background: "transparent",
      fontFamily: "var(--font-sans)",
      fontSize: touch ? "var(--text-base)" : "var(--text-sm)",
      color: "var(--text-primary)",
      cursor: disabled ? "not-allowed" : "text",
    };

    return (
      <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <label
          htmlFor={id}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
            color: "var(--text-primary)",
          }}
        >
          {label}
        </label>

        <div
          style={containerStyle}
          onFocus={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--input-focus-border, #4F958D)";
            (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--input-focus-ring)";
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              (e.currentTarget as HTMLDivElement).style.borderColor = error
                ? "#C0392B"
                : "var(--input-border, #E7E2DC)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
            }
          }}
        >
          <input
            ref={inputRef}
            id={id}
            name={name}
            type={type}
            value={value}
            defaultValue={defaultValue}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete={autoComplete}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            onChange={onChange}
            onBlur={onBlur}
            style={inputStyle}
          />
          {suffix}
        </div>

        {error && (
          <span
            id={errorId}
            role="alert"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-xs)",
              color: "#C0392B",
            }}
          >
            {error}
          </span>
        )}
      </div>
    );
  },
);

FormField.displayName = "FormField";
