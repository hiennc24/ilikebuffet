/**
 * App — root router for ilikebuffet Admin.
 *
 * Auth gate:
 *   unauthenticated     → /login
 *   must-change-password → /change-password
 *   choosing-branch     → /choose-branch
 *   authenticated       → protected routes (AdminShell)
 */

import * as React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./auth/auth-context";
import { LoginPage } from "./auth/login-page";
import { ChooseBranchPage } from "./auth/choose-branch-page";
import { ChangePasswordPage } from "./auth/change-password-page";
import { AdminShell } from "./layout/admin-shell";
import { DashboardPage } from "./pages/dashboard-page";
import { TicketTypesPage } from "./pages/ticket-types-page";
import { PricingPage } from "./pages/pricing-page";
import { DiscountsPage } from "./pages/discounts-page";
import { ShiftMonitorPage } from "./pages/shift-monitor-page";
import "@ilikebuffet/ui/tokens.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/** Renders children only when authenticated, otherwise redirects. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  if (status === "must-change-password") return <Navigate to="/change-password" replace />;
  if (status === "choosing-branch") return <Navigate to="/choose-branch" replace />;

  return <>{children}</>;
}

/** Shell wrapper that wires router navigation to AdminShell. */
function ShellLayout({ children, pageTitle }: { children: React.ReactNode; pageTitle?: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AdminShell
      activePath={location.pathname}
      onNavigate={navigate}
      pageTitle={pageTitle}
    >
      {children}
    </AdminShell>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public auth routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/choose-branch" element={<ChooseBranchPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />

            {/* Protected routes */}
            <Route
              path="/*"
              element={
                <AuthGate>
                  <Routes>
                    <Route
                      path="/"
                      element={
                        <ShellLayout pageTitle="Tổng quan">
                          <DashboardPage />
                        </ShellLayout>
                      }
                    />
                    <Route
                      path="/settings/ticket-types"
                      element={
                        <ShellLayout pageTitle="Loại vé">
                          <TicketTypesPage />
                        </ShellLayout>
                      }
                    />
                    <Route
                      path="/settings/pricing"
                      element={
                        <ShellLayout pageTitle="Bảng giá">
                          <PricingPage />
                        </ShellLayout>
                      }
                    />
                    <Route
                      path="/settings/discounts"
                      element={
                        <ShellLayout pageTitle="Giảm giá">
                          <DiscountsPage />
                        </ShellLayout>
                      }
                    />
                    <Route
                      path="/monitor"
                      element={
                        <ShellLayout pageTitle="Theo dõi ca">
                          <ShiftMonitorPage />
                        </ShellLayout>
                      }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AuthGate>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
