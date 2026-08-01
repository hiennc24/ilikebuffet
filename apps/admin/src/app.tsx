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
import { OrdersPage } from "./pages/orders-page";
import { BranchesPage } from "./pages/branches-page";
import { SuppliersPage } from "./pages/suppliers-page";
import { UsersPage } from "./pages/users-page";
import { AuditPage } from "./pages/audit-page";
import { DevicesPage } from "./pages/devices-page";
import { HolidaysPage } from "./pages/holidays-page";
import { IngredientsPage } from "./pages/ingredients-page";
import { AccountsPage } from "./pages/accounts-page";
import { RevenueReportPage } from "./pages/revenue-report-page";
import { canAccessPath } from "./lib/rbac";
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

/** Gate a restricted screen by role (server still enforces; this hides the UI). */
function RequireAccess({ path, children }: { path: string; children: React.ReactNode }) {
  const { role } = useAuth();
  if (!canAccessPath(role, path)) return <Navigate to="/" replace />;
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
                      path="/orders"
                      element={
                        <RequireAccess path="/orders">
                          <ShellLayout pageTitle="Đơn hàng">
                            <OrdersPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/settings/branches"
                      element={
                        <RequireAccess path="/settings/branches">
                          <ShellLayout pageTitle="Chi nhánh">
                            <BranchesPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/master-data/suppliers"
                      element={
                        <RequireAccess path="/master-data/suppliers">
                          <ShellLayout pageTitle="Nhà cung cấp">
                            <SuppliersPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/settings/users"
                      element={
                        <RequireAccess path="/settings/users">
                          <ShellLayout pageTitle="Người dùng & vai trò">
                            <UsersPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/settings/log"
                      element={
                        <RequireAccess path="/settings/log">
                          <ShellLayout pageTitle="Nhật ký">
                            <AuditPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/devices"
                      element={
                        <RequireAccess path="/devices">
                          <ShellLayout pageTitle="Thiết bị">
                            <DevicesPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/master-data/holidays"
                      element={
                        <RequireAccess path="/master-data/holidays">
                          <ShellLayout pageTitle="Lịch lễ">
                            <HolidaysPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/inventory"
                      element={
                        <RequireAccess path="/inventory">
                          <ShellLayout pageTitle="Kho nguyên liệu">
                            <IngredientsPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/master-data/accounts"
                      element={
                        <RequireAccess path="/master-data/accounts">
                          <ShellLayout pageTitle="Tài khoản kế toán">
                            <AccountsPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/reports/revenue"
                      element={
                        <RequireAccess path="/reports/revenue">
                          <ShellLayout pageTitle="Báo cáo doanh thu">
                            <RevenueReportPage />
                          </ShellLayout>
                        </RequireAccess>
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
