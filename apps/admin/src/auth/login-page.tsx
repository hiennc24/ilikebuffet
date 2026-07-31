/**
 * LoginPage — step 1 of the SC-HT-01 auth flow.
 *
 * H1 fix: guards on auth status so React Router doesn't keep rendering this
 * page after login() transitions the context. The /login route is NOT inside
 * AuthGate, so without the guard a user who just logged in (status changes
 * to "choosing-branch" or "authenticated") would stay stuck on /login.
 *
 * NOTE (M2): the server is the real gate — JwtAuthGuard rejects all
 * non-change-password routes while the `mcp` claim is set. The FE redirect
 * from must-change-password is UX convenience, not a security boundary.
 *
 * NOTE (M3 — ACCEPTED RISK): access and refresh tokens are stored in
 * sessionStorage (XSS-exfiltrable plaintext). Accepted for M1; P8 follow-up
 * will migrate the refresh token to an httpOnly cookie.
 */

import * as React from "react";
import { Navigate } from "react-router-dom";
import { FormField, Button } from "@ilikebuffet/ui";
import { useAuth } from "./auth-context";

export const LoginPage: React.FC = () => {
  const { status, login, error, loading } = useAuth();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  // H1: redirect away if we're no longer unauthenticated.
  if (status === "authenticated") return <Navigate to="/" replace />;
  if (status === "choosing-branch") return <Navigate to="/choose-branch" replace />;
  if (status === "must-change-password") return <Navigate to="/change-password" replace />;

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
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          width: "400px",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
        }}
      >
        {/* Brand mark — terracotta is allowed on the logo, NOT on action buttons (DECISION #1). */}
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
          <strong
            style={{
              fontSize: "var(--text-md)",
              fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
            }}
          >
            ilikebuffet Admin
          </strong>
        </div>

        {/* Login card */}
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
          <FormField
            name="username"
            label="Email hoặc số điện thoại"
            type="text"
            placeholder="ban@ilikebuffet.vn"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />

          <FormField
            name="password"
            label="Mật khẩu"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          {error && (
            <span role="alert" style={{ fontSize: "var(--text-sm)", color: "#C0392B" }}>
              {error}
            </span>
          )}

          {/* CTA — action variant uses --action-bg (lam teal), NOT terracotta (DECISION #1). */}
          <Button
            type="submit"
            variant="action"
            disabled={loading || !username || !password}
            style={{ width: "100%", height: "44px" }}
          >
            {loading ? "Đang đăng nhập…" : "Đăng nhập"}
          </Button>
        </form>

        <p
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          Chưa có tài khoản? Liên hệ quản lý chi nhánh để được mời.
        </p>
      </div>
    </div>
  );
};
