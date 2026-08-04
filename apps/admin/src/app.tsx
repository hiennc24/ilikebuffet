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
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./auth/auth-context";
import { toast, Toaster } from "./lib/toast";
import { toErrorMessage } from "./pages/_shared/admin-ui";
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
import { PermissionsPage } from "./pages/permissions-page";
import { AuditPage } from "./pages/audit-page";
import { DevicesPage } from "./pages/devices-page";
import { HolidaysPage } from "./pages/holidays-page";
import { IngredientsPage } from "./pages/ingredients-page";
import { PurchaseOrdersPage } from "./pages/purchase-orders-page";
import { StockPage } from "./pages/stock-page";
import { StockTransferPage } from "./pages/stock-transfer-page";
import { TicketRecipesPage } from "./pages/ticket-recipes-page";
import { AccountsPage } from "./pages/accounts-page";
import { RevenueReportPage } from "./pages/revenue-report-page";
import { GrossMarginReportPage } from "./pages/gross-margin-report-page";
import { PnlReportPage } from "./pages/pnl-report-page";
import { BankReconcilePage } from "./pages/bank-reconcile-page";
import { ChainDashboardPage } from "./pages/chain-dashboard-page";
import { FinancePage } from "./pages/finance-page";
import { SupplierDebtPage } from "./pages/supplier-debt-page";
import { SupplierAgingPage } from "./pages/supplier-aging-page";
import { ShiftCashReportPage } from "./pages/shift-cash-report-page";
import { OfflineReconPage } from "./pages/offline-recon-page";
import { canAccessPath } from "./lib/rbac";
import { ThemeProvider } from "./lib/theme";
import "@ilikebuffet/ui/tokens.css";

const queryClient = new QueryClient({
  // Every mutation gets action feedback via a toast, from one place (no per-page
  // wiring). A mutation can override the success text with `meta.successMessage`
  // or opt out of the success toast with `meta.silent`.
  mutationCache: new MutationCache({
    onError: (error) => toast.error(toErrorMessage(error)),
    onSuccess: (_data, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return;
      toast.success((mutation.meta?.successMessage as string | undefined) ?? "Thành công");
    },
  }),
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
function ShellLayout({
  children,
  pageTitle,
  pageActions,
  pageToolbar,
  bareChrome,
}: {
  children: React.ReactNode;
  pageTitle?: string;
  pageActions?: React.ReactNode;
  pageToolbar?: React.ReactNode;
  /** Pass-through to AdminShell.bareChrome — suppresses the global PageHeader
   *  for pages that render their own chrome (e.g. UsersPage). */
  bareChrome?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AdminShell
      activePath={location.pathname}
      onNavigate={navigate}
      pageTitle={pageTitle}
      pageActions={pageActions}
      pageToolbar={pageToolbar}
      bareChrome={bareChrome}
    >
      {children}
    </AdminShell>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <Toaster />
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
                        <ShellLayout bareChrome>
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
                        <ShellLayout bareChrome>
                          <DiscountsPage />
                        </ShellLayout>
                      }
                    />
                    <Route
                      path="/orders"
                      element={
                        <RequireAccess path="/orders">
                          <ShellLayout bareChrome>
                            <OrdersPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/settings/branches"
                      element={
                        <RequireAccess path="/settings/branches">
                          <ShellLayout bareChrome>
                            <BranchesPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/master-data/suppliers"
                      element={
                        <RequireAccess path="/master-data/suppliers">
                          <ShellLayout bareChrome>
                            <SuppliersPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/settings/users"
                      element={
                        <RequireAccess path="/settings/users">
                          <ShellLayout bareChrome>
                            <UsersPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/settings/permissions"
                      element={
                        <RequireAccess path="/settings/permissions">
                          <ShellLayout bareChrome>
                            <PermissionsPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/settings/log"
                      element={
                        <RequireAccess path="/settings/log">
                          <ShellLayout bareChrome>
                            <AuditPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/devices"
                      element={
                        <RequireAccess path="/devices">
                          <ShellLayout bareChrome>
                            <DevicesPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/master-data/holidays"
                      element={
                        <RequireAccess path="/master-data/holidays">
                          <ShellLayout bareChrome>
                            <HolidaysPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/inventory"
                      element={
                        <RequireAccess path="/inventory">
                          <ShellLayout bareChrome>
                            <IngredientsPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/inventory/purchase-orders"
                      element={
                        <RequireAccess path="/inventory/purchase-orders">
                          <ShellLayout bareChrome>
                            <PurchaseOrdersPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/inventory/stock"
                      element={
                        <RequireAccess path="/inventory/stock">
                          <ShellLayout bareChrome>
                            <StockPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/inventory/transfers"
                      element={
                        <RequireAccess path="/inventory/transfers">
                          <ShellLayout bareChrome>
                            <StockTransferPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/inventory/recipes"
                      element={
                        <RequireAccess path="/inventory/recipes">
                          <ShellLayout pageTitle="Định mức theo loại vé">
                            <TicketRecipesPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/master-data/accounts"
                      element={
                        <RequireAccess path="/master-data/accounts">
                          <ShellLayout bareChrome>
                            <AccountsPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/reports/revenue"
                      element={
                        <RequireAccess path="/reports/revenue">
                          <ShellLayout bareChrome>
                            <RevenueReportPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/reports/gross-margin"
                      element={
                        <RequireAccess path="/reports/gross-margin">
                          <ShellLayout bareChrome>
                            <GrossMarginReportPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/reports/pnl"
                      element={
                        <RequireAccess path="/reports/pnl">
                          <ShellLayout bareChrome>
                            <PnlReportPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/reports/bank-reconcile"
                      element={
                        <RequireAccess path="/reports/bank-reconcile">
                          <ShellLayout bareChrome>
                            <BankReconcilePage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/reports/chain"
                      element={
                        <RequireAccess path="/reports/chain">
                          <ShellLayout bareChrome>
                            <ChainDashboardPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/finance"
                      element={
                        <RequireAccess path="/finance">
                          <ShellLayout bareChrome>
                            <FinancePage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/finance/payables"
                      element={
                        <RequireAccess path="/finance/payables">
                          <ShellLayout bareChrome>
                            <SupplierDebtPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/finance/aging"
                      element={
                        <RequireAccess path="/finance/aging">
                          <ShellLayout bareChrome>
                            <SupplierAgingPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/reports/shift-cash"
                      element={
                        <RequireAccess path="/reports/shift-cash">
                          <ShellLayout bareChrome>
                            <ShiftCashReportPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/reports/offline"
                      element={
                        <RequireAccess path="/reports/offline">
                          <ShellLayout bareChrome>
                            <OfflineReconPage />
                          </ShellLayout>
                        </RequireAccess>
                      }
                    />
                    <Route
                      path="/monitor"
                      element={
                        <ShellLayout bareChrome>
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
      </ThemeProvider>
    </QueryClientProvider>
  );
}
