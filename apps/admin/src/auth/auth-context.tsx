/**
 * AuthContext — auth state + token lifecycle for ilikebuffet Admin.
 *
 * State machine:
 *   unauthenticated → login → mustChangePassword? → chooseBranch → authenticated
 *
 * Token storage: sessionStorage (tab-scoped, clears on close).
 * BranchId storage: localStorage (persists across reloads per mockup note).
 *
 * The ApiClient is constructed here and updated on every render cycle so
 * its getTokens/getBranchId closures always read current state.
 */

import * as React from "react";
import { ApiClient, ApiError } from "../lib/api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Branch {
  id: string;
  name: string;
  address?: string;
}

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  selectedBranchId: string | null;
  mustChangePassword: boolean;
  /** Populated after login, before branch selection. */
  availableBranches: Branch[];
  status: "unauthenticated" | "choosing-branch" | "must-change-password" | "authenticated";
}

export interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  selectBranch: (branchId: string) => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
  api: ApiClient;
  error: string | null;
  loading: boolean;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  accessToken: "ibb_admin_at",
  refreshToken: "ibb_admin_rt",
  branchId: "ibb_admin_branch",
} as const;

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * Normalise a list response. Most endpoints return a bare array, but some
 * platform list endpoints (e.g. GET /branches) wrap results in a { data: [] }
 * envelope. Accept either shape so the auth flow is resilient to the mismatch.
 * TODO(contract): align GET /branches with the bare-array convention used by
 * /sales/* and remove this shim once the API is consistent.
 */
function unwrapList<T>(res: T[] | { data: T[] } | null | undefined): T[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray((res as { data?: T[] }).data)) return (res as { data: T[] }).data;
  return [];
}

export const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: React.ReactNode;
  /** Override API base URL for tests. */
  apiBaseUrl?: string;
  /** Override onAuthFailure (default: clear session + reload to /login). */
  onAuthFailure?: () => void;
}

function readStoredTokens() {
  return {
    accessToken: sessionStorage.getItem(STORAGE_KEYS.accessToken),
    refreshToken: sessionStorage.getItem(STORAGE_KEYS.refreshToken),
    selectedBranchId: localStorage.getItem(STORAGE_KEYS.branchId),
  };
}

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  apiBaseUrl,
  onAuthFailure,
}) => {
  const stored = readStoredTokens();

  const [state, setState] = React.useState<AuthState>({
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    selectedBranchId: stored.selectedBranchId,
    mustChangePassword: false,
    availableBranches: [],
    status: stored.accessToken && stored.selectedBranchId ? "authenticated" : "unauthenticated",
  });

  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Build ApiClient once; deps are updated on every render via updateDeps.
  const apiRef = React.useRef<ApiClient>(
    new ApiClient({
      baseUrl: apiBaseUrl ?? "",
      getTokens: () =>
        state.accessToken && state.refreshToken
          ? { accessToken: state.accessToken, refreshToken: state.refreshToken }
          : null,
      getBranchId: () => state.selectedBranchId,
      onRefreshed: (tokens) => {
        sessionStorage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken);
        if (tokens.refreshToken) {
          sessionStorage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);
        }
        setState((s) => ({ ...s, ...tokens }));
      },
      onAuthFailure: onAuthFailure ?? (() => {
        sessionStorage.clear();
        localStorage.removeItem(STORAGE_KEYS.branchId);
        window.location.replace("/login");
      }),
    }),
  );

  // Keep ApiClient deps in sync with latest state/callbacks without
  // rebuilding the client instance (avoids losing inflight dedup state).
  React.useEffect(() => {
    apiRef.current.updateDeps({
      baseUrl: apiBaseUrl ?? "",
      getTokens: () =>
        state.accessToken && state.refreshToken
          ? { accessToken: state.accessToken, refreshToken: state.refreshToken }
          : null,
      getBranchId: () => state.selectedBranchId,
      onRefreshed: (tokens) => {
        sessionStorage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken);
        if (tokens.refreshToken) {
          sessionStorage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);
        }
        setState((s) => ({ ...s, ...tokens }));
      },
      onAuthFailure: onAuthFailure ?? (() => {
        sessionStorage.clear();
        localStorage.removeItem(STORAGE_KEYS.branchId);
        window.location.replace("/login");
      }),
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  const login = React.useCallback(
    async (username: string, password: string) => {
      setError(null);
      setLoading(true);
      try {
        interface LoginResponse {
          accessToken: string;
          refreshToken: string;
          mustChangePassword?: boolean;
        }
        const data = await apiRef.current.post<LoginResponse>("/auth/login", {
          username,
          password,
        });

        sessionStorage.setItem(STORAGE_KEYS.accessToken, data.accessToken);
        sessionStorage.setItem(STORAGE_KEYS.refreshToken, data.refreshToken);

        if (data.mustChangePassword) {
          setState((s) => ({
            ...s,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            mustChangePassword: true,
            status: "must-change-password",
          }));
          return;
        }

        // Fetch branches the user has access to (GET /branches).
        // M5 fix: surface error when /branches fails — silently continuing
        // left the user on choose-branch with an empty list and no feedback.
        //
        // Pass the freshly-issued access token explicitly: React state (which
        // the ApiClient's getTokens() closure reads) has NOT updated yet in this
        // tick, so without this the request goes out with no Authorization header
        // and the API returns 401 → silent-refresh fails → onAuthFailure bounces
        // the user back to /login. The mock fetch in tests ignored headers, which
        // is why this never surfaced until running against the real API.
        interface BranchResponse { id: string; name: string; address?: string }
        let branches: Branch[];
        try {
          branches = unwrapList(
            await apiRef.current.get<BranchResponse[] | { data: BranchResponse[] }>("/branches", {
              headers: { Authorization: `Bearer ${data.accessToken}` },
            }),
          );
        } catch (branchErr) {
          const msg = branchErr instanceof ApiError
            ? `Không tải được danh sách chi nhánh (${branchErr.status})`
            : "Không kết nối được máy chủ khi tải chi nhánh";
          setError(msg);
          return;
        }

        if (branches.length === 0) {
          setError("Tài khoản chưa được gán chi nhánh nào. Liên hệ quản trị viên.");
          return;
        }

        if (branches.length === 1) {
          // Single branch: skip the choose-branch step (per mockup note).
          const branchId = branches[0].id;
          localStorage.setItem(STORAGE_KEYS.branchId, branchId);
          setState({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            selectedBranchId: branchId,
            mustChangePassword: false,
            availableBranches: branches,
            status: "authenticated",
          });
        } else {
          setState({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            selectedBranchId: null,
            mustChangePassword: false,
            availableBranches: branches,
            status: "choosing-branch",
          });
        }
      } catch (err) {
        const message = err instanceof ApiError
          ? `Đăng nhập thất bại (${err.status})`
          : "Không kết nối được máy chủ";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // ── selectBranch ───────────────────────────────────────────────────────────

  const selectBranch = React.useCallback((branchId: string) => {
    localStorage.setItem(STORAGE_KEYS.branchId, branchId);
    setState((s) => ({
      ...s,
      selectedBranchId: branchId,
      status: "authenticated",
    }));
  }, []);

  // ── changePassword ─────────────────────────────────────────────────────────

  const changePassword = React.useCallback(
    async (oldPassword: string, newPassword: string) => {
      setError(null);
      setLoading(true);
      try {
        await apiRef.current.post("/auth/change-password", {
          oldPassword,
          newPassword,
        });
        // After successful change, proceed to branch selection.
        interface BranchResponse { id: string; name: string; address?: string }
        const branches = unwrapList(await apiRef.current.get<BranchResponse[] | { data: BranchResponse[] }>("/branches"));
        setState((s) => ({
          ...s,
          mustChangePassword: false,
          availableBranches: branches,
          status: branches.length === 1 ? "authenticated" : "choosing-branch",
          selectedBranchId: branches.length === 1 ? branches[0].id : null,
        }));
        if (branches.length === 1) {
          localStorage.setItem(STORAGE_KEYS.branchId, branches[0].id);
        }
      } catch (err) {
        const message = err instanceof ApiError
          ? `Đổi mật khẩu thất bại (${err.status})`
          : "Không kết nối được máy chủ";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // ── logout ─────────────────────────────────────────────────────────────────

  const logout = React.useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEYS.accessToken);
    sessionStorage.removeItem(STORAGE_KEYS.refreshToken);
    localStorage.removeItem(STORAGE_KEYS.branchId);
    setState({
      accessToken: null,
      refreshToken: null,
      selectedBranchId: null,
      mustChangePassword: false,
      availableBranches: [],
      status: "unauthenticated",
    });
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    selectBranch,
    changePassword,
    logout,
    api: apiRef.current,
    error,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
