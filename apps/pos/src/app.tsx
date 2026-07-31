/**
 * POS App — root router.
 *
 * Auth gate:
 *   unauthenticated  → /login
 *   locked           → /lock (PIN screen)
 *   choosing-branch  → /choose-branch (stub)
 *   authenticated    → /sell (main POS screen)
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
                  <Routes>
                    <Route
                      path="/"
                      element={
                        <PosShell pageTitle="Bán hàng">
                          <SellPage />
                        </PosShell>
                      }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AuthGate>
              }
            />
          </Routes>
        </PosAuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
