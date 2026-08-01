/**
 * PosAuthContext — auth state for the POS PWA.
 *
 * Mirrors apps/admin/src/auth/auth-context.tsx but adapted for POS:
 *   - PIN login via POST /auth/pin-login {deviceId, deviceSecret, userId, pin}
 *   - Standard username/password login also available (same /auth/login)
 *   - Token refresh on 401 (same as admin)
 *   - Lock screen (PIN re-entry) after idle — shell only; full offline logic deferred.
 *
 * Device credentials (deviceId, deviceSecret) are stored in localStorage
 * so PIN login works even after reload. Full offline PIN is deferred.
 */

import * as React from "react";
import { ApiClient, ApiError } from "../lib/pos-api-client";

export interface PosAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  selectedBranchId: string | null;
  userId: string | null;
  status: "unauthenticated" | "choosing-branch" | "authenticated" | "locked";
}

export interface PosAuthContextValue extends PosAuthState {
  login: (username: string, password: string) => Promise<void>;
  pinLogin: (pin: string) => Promise<void>;
  selectBranch: (branchId: string) => void;
  lock: () => void;
  logout: () => void;
  api: ApiClient;
  error: string | null;
  loading: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address?: string;
}

const STORAGE = {
  accessToken: "ibb_pos_at",
  refreshToken: "ibb_pos_rt",
  branchId: "ibb_pos_branch",
  deviceId: "ibb_pos_device_id",
  deviceSecret: "ibb_pos_device_secret",
  userId: "ibb_pos_user_id",
} as const;

/**
 * Normalise a list response: platform endpoints (branches, master data) use a
 * paginated { data, total } envelope; /sales/* return bare arrays. Accept both.
 */
function unwrapList<T>(res: T[] | { data: T[] } | null | undefined): T[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray((res as { data?: T[] }).data)) return (res as { data: T[] }).data;
  return [];
}

export const PosAuthContext = React.createContext<PosAuthContextValue | null>(null);

export function usePosAuth(): PosAuthContextValue {
  const ctx = React.useContext(PosAuthContext);
  if (!ctx) throw new Error("usePosAuth must be used inside PosAuthProvider");
  return ctx;
}

interface PosAuthProviderProps {
  children: React.ReactNode;
  apiBaseUrl?: string;
  onAuthFailure?: () => void;
}

function readStored() {
  return {
    accessToken: sessionStorage.getItem(STORAGE.accessToken),
    refreshToken: sessionStorage.getItem(STORAGE.refreshToken),
    branchId: localStorage.getItem(STORAGE.branchId),
    userId: localStorage.getItem(STORAGE.userId),
  };
}

export const PosAuthProvider: React.FC<PosAuthProviderProps> = ({
  children,
  apiBaseUrl,
  onAuthFailure,
}) => {
  const stored = readStored();

  const [state, setState] = React.useState<PosAuthState>({
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    selectedBranchId: stored.branchId,
    userId: stored.userId,
    status:
      stored.accessToken && stored.branchId ? "authenticated" : "unauthenticated",
  });

  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const apiRef = React.useRef<ApiClient>(
    new ApiClient({
      baseUrl: apiBaseUrl ?? "",
      getTokens: () =>
        state.accessToken && state.refreshToken
          ? { accessToken: state.accessToken, refreshToken: state.refreshToken }
          : null,
      getBranchId: () => state.selectedBranchId,
      onRefreshed: (tokens) => {
        sessionStorage.setItem(STORAGE.accessToken, tokens.accessToken);
        if (tokens.refreshToken) {
          sessionStorage.setItem(STORAGE.refreshToken, tokens.refreshToken);
        }
        setState((s) => ({ ...s, ...tokens }));
      },
      onAuthFailure: onAuthFailure ?? (() => {
        sessionStorage.clear();
        localStorage.removeItem(STORAGE.branchId);
        window.location.replace("/login");
      }),
    }),
  );

  // Keep ApiClient deps current whenever the inputs that affect them change.
  // getTokens/getBranchId are closures over state — rebuilding them when the
  // state values change is sufficient. The ApiClient always calls getTokens()
  // at request time, so it reads the latest token even when state hasn't
  // flushed yet (the test "state-not-yet-updated" covers this invariant).
  const { accessToken, refreshToken, selectedBranchId } = state;
  React.useEffect(() => {
    apiRef.current.updateDeps({
      baseUrl: apiBaseUrl ?? "",
      getTokens: () =>
        accessToken && refreshToken
          ? { accessToken, refreshToken }
          : null,
      getBranchId: () => selectedBranchId,
      onRefreshed: (tokens) => {
        sessionStorage.setItem(STORAGE.accessToken, tokens.accessToken);
        if (tokens.refreshToken) {
          sessionStorage.setItem(STORAGE.refreshToken, tokens.refreshToken);
        }
        setState((s) => ({ ...s, ...tokens }));
      },
      onAuthFailure: onAuthFailure ?? (() => {
        sessionStorage.clear();
        localStorage.removeItem(STORAGE.branchId);
        window.location.replace("/login");
      }),
    });
  }, [apiBaseUrl, accessToken, refreshToken, selectedBranchId, onAuthFailure]);

  const login = React.useCallback(async (username: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      interface LoginResponse {
        accessToken: string;
        refreshToken: string;
        sub?: string;
      }
      const data = await apiRef.current.post<LoginResponse>("/auth/login", {
        username,
        password,
      });

      sessionStorage.setItem(STORAGE.accessToken, data.accessToken);
      sessionStorage.setItem(STORAGE.refreshToken, data.refreshToken);
      if (data.sub) {
        localStorage.setItem(STORAGE.userId, data.sub);
      }

      // Fetch branches (M5 fix: surface error instead of silently continuing).
      // Pass the fresh token explicitly — React state (which the ApiClient reads)
      // has not updated in this tick, so relying on it sends no Authorization
      // header → 401 → bounce back to login.
      interface BranchResponse { id: string; name: string; address?: string }
      let branches: BranchResponse[];
      try {
        branches = unwrapList(
          await apiRef.current.get<BranchResponse[] | { data: BranchResponse[] }>("/branches", {
            headers: { Authorization: `Bearer ${data.accessToken}` },
          }),
        );
      } catch (branchErr) {
        setError(branchErr instanceof ApiError
          ? `Không tải được danh sách chi nhánh (${branchErr.status})`
          : "Lỗi kết nối khi tải chi nhánh");
        return;
      }

      if (branches.length === 0) {
        setError("Tài khoản chưa được gán chi nhánh nào. Liên hệ quản trị viên.");
        return;
      }

      if (branches.length === 1) {
        localStorage.setItem(STORAGE.branchId, branches[0].id);
        setState({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          selectedBranchId: branches[0].id,
          userId: data.sub ?? null,
          status: "authenticated",
        });
      } else {
        setState({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          selectedBranchId: null,
          userId: data.sub ?? null,
          status: "choosing-branch",
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? `Đăng nhập thất bại (${err.status})` : "Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }, []);

  const pinLogin = React.useCallback(async (pin: string) => {
    setError(null);
    setLoading(true);
    try {
      const deviceId = localStorage.getItem(STORAGE.deviceId) ?? "";
      const deviceSecret = localStorage.getItem(STORAGE.deviceSecret) ?? "";
      const userId = localStorage.getItem(STORAGE.userId) ?? "";

      interface PinLoginResponse { accessToken: string; refreshToken: string }
      const data = await apiRef.current.post<PinLoginResponse>("/auth/pin-login", {
        deviceId,
        deviceSecret,
        userId,
        pin,
      });

      sessionStorage.setItem(STORAGE.accessToken, data.accessToken);
      sessionStorage.setItem(STORAGE.refreshToken, data.refreshToken);

      setState((s) => ({
        ...s,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        status: "authenticated",
      }));
    } catch (err) {
      setError(err instanceof ApiError ? `PIN không đúng (${err.status})` : "Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }, []);

  const selectBranch = React.useCallback((branchId: string) => {
    localStorage.setItem(STORAGE.branchId, branchId);
    setState((s) => ({ ...s, selectedBranchId: branchId, status: "authenticated" }));
  }, []);

  const lock = React.useCallback(() => {
    sessionStorage.removeItem(STORAGE.accessToken);
    sessionStorage.removeItem(STORAGE.refreshToken);
    setState((s) => ({
      ...s,
      accessToken: null,
      refreshToken: null,
      status: "locked",
    }));
  }, []);

  const logout = React.useCallback(() => {
    sessionStorage.removeItem(STORAGE.accessToken);
    sessionStorage.removeItem(STORAGE.refreshToken);
    localStorage.removeItem(STORAGE.branchId);
    setState({
      accessToken: null,
      refreshToken: null,
      selectedBranchId: null,
      userId: null,
      status: "unauthenticated",
    });
  }, []);

  const value: PosAuthContextValue = {
    ...state,
    login,
    pinLogin,
    selectBranch,
    lock,
    logout,
    api: apiRef.current,
    error,
    loading,
  };

  return <PosAuthContext.Provider value={value}>{children}</PosAuthContext.Provider>;
};
