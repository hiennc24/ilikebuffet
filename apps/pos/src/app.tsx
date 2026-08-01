/**
 * POS App — root router.
 *
 * Auth gate:
 *   unauthenticated  → /login
 *   locked           → /lock (PIN screen)
 *   choosing-branch  → /choose-branch (stub)
 *   authenticated    → session gate:
 *     no-shift       → /open-shift
 *     ready          → /sell (main POS screen)
 */

import * as React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PosAuthProvider, usePosAuth } from "./auth/pos-auth-context";
import { PosLoginPage } from "./auth/pos-login-page";
import { PinLockScreen } from "./auth/pin-lock-screen";
import { PosShell } from "./layout/pos-shell";
import { SellPage } from "./pages/sell-page";
import { OpenShiftPage } from "./pages/open-shift-page";
import { PosSessionProvider, usePosSession } from "./session/pos-session-context";
import "@ilikebuffet/ui/tokens.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = usePosAuth();
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  if (status === "locked") return <Navigate to="/lock" replace />;
  if (status === "choosing-branch") return <Navigate to="/choose-branch" replace />;
  return <>{children}</>;
}

function SessionGate() {
  const { status } = usePosSession();

  if (status === "loading") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          color: "var(--text-muted)",
        }}
      >
        Đang kiểm tra ca làm việc…
      </div>
    );
  }

  if (status === "no-shift") {
    return <OpenShiftPage />;
  }

  // status === "ready"
  return (
    <Routes>
      <Route
        path="/sell"
        element={
          <PosShell pageTitle="Bán hàng">
            <SellPage />
          </PosShell>
        }
      />
      <Route path="*" element={<Navigate to="/sell" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PosAuthProvider>
          <Routes>
            <Route path="/login" element={<PosLoginPage />} />
            <Route path="/lock" element={<PinLockScreen />} />

            {/* Protected */}
            <Route
              path="/*"
              element={
                <AuthGate>
                  <PosSessionProvider>
                    <SessionGate />
                  </PosSessionProvider>
                </AuthGate>
              }
            />
          </Routes>
        </PosAuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
