/**
 * ChooseBranchPage — step 3 of the SC-HT-01 auth flow.
 *
 * Shows branches the user has access to (populated by AuthContext after login).
 * Single-branch users skip this screen entirely (auto-selected in auth-context).
 * CTA uses action variant (lam teal) — DECISION #1.
 */

import * as React from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@ilikebuffet/ui";
import { useAuth } from "./auth-context";

export const ChooseBranchPage: React.FC = () => {
  const { status, availableBranches, selectBranch } = useAuth();

  // If status moved on (e.g. single-branch auto-selected), redirect.
  if (status === "authenticated") return <Navigate to="/" replace />;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  if (status === "must-change-password") return <Navigate to="/change-password" replace />;
  const [selectedId, setSelectedId] = React.useState<string | null>(
    availableBranches[0]?.id ?? null,
  );

  const handleConfirm = () => {
    if (selectedId) selectBranch(selectedId);
  };

  const selectedBranch = availableBranches.find((b) => b.id === selectedId);

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
        <div
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
              Chọn chi nhánh
            </strong>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              Bạn có quyền ở {availableBranches.length} chi nhánh. Đổi được bất cứ lúc nào.
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Chi nhánh"
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
          >
            {availableBranches.map((branch) => {
              const isSelected = branch.id === selectedId;
              return (
                <button
                  key={branch.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedId(branch.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    padding: "var(--space-3) var(--space-4)",
                    border: `1px solid ${isSelected ? "var(--action-bg)" : "var(--border-subtle)"}`,
                    borderRadius: "var(--radius-md)",
                    background: isSelected ? "var(--nav-active-bg, #EFF6F5)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "var(--font-sans)",
                    transition: "border-color var(--dur-fast), background var(--dur-fast)",
                  }}
                >
                  {/* Radio indicator */}
                  <span
                    style={{
                      width: "16px",
                      height: "16px",
                      minWidth: "16px",
                      borderRadius: "50%",
                      border: `2px solid ${isSelected ? "var(--action-bg)" : "var(--border-default)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isSelected && (
                      <span
                        style={{
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          background: "var(--action-bg)",
                        }}
                      />
                    )}
                  </span>

                  <span
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--space-1)",
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--text-sm)",
                        fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {branch.name}
                    </span>
                    {branch.address && (
                      <span
                        style={{
                          fontSize: "var(--text-xs)",
                          color: "var(--text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {branch.address}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* CTA — lam teal, NOT terracotta (DECISION #1) */}
          <Button
            variant="action"
            disabled={!selectedId}
            onClick={handleConfirm}
            style={{ width: "100%", height: "44px" }}
          >
            Vào {selectedBranch?.name ?? "chi nhánh"}
          </Button>
        </div>
      </div>
    </div>
  );
};
