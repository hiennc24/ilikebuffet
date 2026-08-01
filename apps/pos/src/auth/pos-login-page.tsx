/**
 * PosLoginPage — POS username/password login.
 *
 * Touch tier (DECISION #8): all interactive elements ≥48px.
 * CTA uses action variant (lam teal), NOT terracotta (DECISION #1).
 *
 * H1 fix: redirects away when status moves past unauthenticated so the
 * login form does not re-render after a successful login() call.
 *
 * NOTE (ACCEPTED RISK): tokens in sessionStorage, deviceSecret in
 * localStorage are XSS-exfiltrable. A follow-up hardening pass will
 * use httpOnly-cookie refresh and secure device-secret binding.
 */

import * as React from "react";
import { Navigate } from "react-router-dom";
import { Button, FormField } from "@ilikebuffet/ui";
import { usePosAuth } from "./pos-auth-context";

export const PosLoginPage: React.FC = () => {
  const { status, login, error, loading } = usePosAuth();

  // H1: redirect away when login() has transitioned status.
  if (status === "authenticated") return <Navigate to="/" replace />;
  if (status === "choosing-branch") return <Navigate to="/choose-branch" replace />;
  if (status === "locked") return <Navigate to="/lock" replace />;
  // Dev convenience: pre-fill the seeded local cashier (THU_NGAN — the role the
  // POS sell/pay flow requires). Empty in production.
  const [username, setUsername] = React.useState(
    import.meta.env.DEV ? "thungan@ilikebuffet.vn" : "",
  );
  const [password, setPassword] = React.useState(
    import.meta.env.DEV ? "Password123" : "",
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-page, #FAF8F6)",
        padding: "var(--space-5)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "360px" }}>
        <form
          onSubmit={handleSubmit}
          style={{
            background: "var(--bg-raised, #FFFFFF)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-6)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-5)",
          }}
        >
          {/* Brand */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-3)",
            }}
          >
            <span
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "#AC4E31",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                fontWeight: 600,
              }}
            >
              i
            </span>
            <strong style={{ fontSize: "var(--text-md)" }}>ilikebuffet POS</strong>
          </div>

          <FormField
            name="username"
            label="Tài khoản"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            touch
            autoComplete="username"
          />

          <FormField
            name="password"
            label="Mật khẩu"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            touch
            autoComplete="current-password"
          />

          {error && (
            <span role="alert" style={{ fontSize: "var(--text-sm)", color: "#C0392B" }}>
              {error}
            </span>
          )}

          {/* Touch CTA — action variant (lam teal), NOT terracotta (DECISION #1) */}
          <Button
            type="submit"
            variant="action"
            touch
            disabled={loading || !username || !password}
            style={{ width: "100%" }}
          >
            {loading ? "Đang đăng nhập…" : "Đăng nhập"}
          </Button>
        </form>
      </div>
    </div>
  );
};
