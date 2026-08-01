/**
 * ChangePasswordPage — forced password change after first login.
 *
 * Shown when mustChangePassword=true in the auth flow (SC-HT-01).
 * On success AuthContext transitions to choosing-branch or authenticated.
 *
 * Redirects away when status is no longer must-change-password.
 * NOTE: the server is the real gate — JwtAuthGuard rejects all routes
 * except /auth/change-password while the JWT `mcp` (mustChangePassword) claim
 * is set. The FE redirect is UX convenience, not a security boundary.
 */

import * as React from "react";
import { Navigate } from "react-router-dom";
import { Button, FormField } from "@ilikebuffet/ui";
import { useAuth } from "./auth-context";

export const ChangePasswordPage: React.FC = () => {
  const { status, changePassword, error, loading } = useAuth();

  // Redirect when status moved on from must-change-password.
  if (status === "authenticated") return <Navigate to="/" replace />;
  if (status === "choosing-branch") return <Navigate to="/choose-branch" replace />;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  const [oldPw, setOldPw] = React.useState("");
  const [newPw, setNewPw] = React.useState("");
  const [confirmPw, setConfirmPw] = React.useState("");
  const [localError, setLocalError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (newPw !== confirmPw) {
      setLocalError("Mật khẩu xác nhận không khớp");
      return;
    }
    if (newPw.length < 8) {
      setLocalError("Mật khẩu mới phải có ít nhất 8 ký tự");
      return;
    }
    await changePassword(oldPw, newPw);
  };

  const displayError = localError ?? error;

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
      <div style={{ width: "400px" }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <strong
              style={{
                fontSize: "var(--text-md)",
                fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              }}
            >
              Đổi mật khẩu
            </strong>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              Tài khoản yêu cầu đổi mật khẩu trước khi tiếp tục.
            </span>
          </div>

          <FormField
            name="oldPassword"
            label="Mật khẩu hiện tại"
            type="password"
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
            autoComplete="current-password"
          />

          <FormField
            name="newPassword"
            label="Mật khẩu mới"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
          />

          <FormField
            name="confirmPassword"
            label="Xác nhận mật khẩu mới"
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            error={localError ?? undefined}
            autoComplete="new-password"
          />

          {displayError && !localError && (
            <span role="alert" style={{ fontSize: "var(--text-sm)", color: "#C0392B" }}>
              {displayError}
            </span>
          )}

          <Button
            type="submit"
            variant="action"
            disabled={loading || !oldPw || !newPw || !confirmPw}
            style={{ width: "100%", height: "44px" }}
          >
            {loading ? "Đang lưu…" : "Đổi mật khẩu"}
          </Button>
        </form>
      </div>
    </div>
  );
};
