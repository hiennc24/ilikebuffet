/**
 * PosSessionContext — shift lifecycle for the POS PWA (M1).
 *
 * Provides:
 *   - deviceId: stable ID stored in localStorage (generated on first use)
 *   - shiftId: current open shift (null until shift is opened)
 *   - branchId: from auth context
 *   - status: "loading" | "no-shift" | "ready"
 *   - openShift(openingCashVnd): POST /sales/shifts, transition to "ready"
 *   - refresh(): re-check open shift from server
 */

import * as React from "react";
import { usePosAuth } from "../auth/pos-auth-context";
import { ApiError } from "../lib/pos-api-client";

const DEVICE_ID_KEY = "ibb_pos_device_id";

function getOrCreateDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export type PosSessionStatus = "loading" | "no-shift" | "ready" | "error";

export interface PosSessionContextValue {
  deviceId: string;
  branchId: string | null;
  shiftId: string | null;
  status: PosSessionStatus;
  openShift: (openingCashVnd: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const PosSessionContext = React.createContext<PosSessionContextValue | null>(null);

export function usePosSession(): PosSessionContextValue {
  const ctx = React.useContext(PosSessionContext);
  if (!ctx) throw new Error("usePosSession must be used inside PosSessionProvider");
  return ctx;
}

interface PosSessionProviderProps {
  children: React.ReactNode;
}

interface Shift {
  id: string;
  [key: string]: unknown;
}

export const PosSessionProvider: React.FC<PosSessionProviderProps> = ({ children }) => {
  const { api, selectedBranchId, status: authStatus } = usePosAuth();

  const [deviceId] = React.useState<string>(getOrCreateDeviceId);
  const [shiftId, setShiftId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<PosSessionStatus>("loading");

  const checkOpenShift = React.useCallback(async () => {
    if (authStatus !== "authenticated" || !selectedBranchId) {
      setStatus("no-shift");
      return;
    }
    setStatus("loading");
    try {
      const shift = await api.get<Shift | null>(
        `/sales/shifts/open?deviceId=${encodeURIComponent(deviceId)}`,
      );
      if (shift && shift.id) {
        setShiftId(shift.id);
        setStatus("ready");
      } else {
        setShiftId(null);
        setStatus("no-shift");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Definitive "no open shift" from the server — clear any stale shiftId.
        setShiftId(null);
        setStatus("no-shift");
      } else {
        // Transient error: network failure or HTTP 5xx. Do NOT clear the
        // previously known shiftId — clearing it risks the cashier opening a
        // duplicate shift when they retry. Surface an error state so the UI
        // can show a "retry" prompt instead of showing "no open shift".
        setStatus("error");
      }
    }
  }, [api, deviceId, selectedBranchId, authStatus]);

  // Check for an open shift on mount and when auth/branch changes.
  React.useEffect(() => {
    if (authStatus === "authenticated") {
      void checkOpenShift();
    }
  }, [authStatus, selectedBranchId, checkOpenShift]);

  const openShift = React.useCallback(
    async (openingCashVnd: number) => {
      if (!selectedBranchId) throw new Error("No branch selected");
      const shift = await api.post<Shift>("/sales/shifts", {
        branchId: selectedBranchId,
        deviceId,
        openingCashVnd,
      });
      setShiftId(shift.id);
      setStatus("ready");
    },
    [api, deviceId, selectedBranchId],
  );

  const value: PosSessionContextValue = {
    deviceId,
    branchId: selectedBranchId,
    shiftId,
    status,
    openShift,
    refresh: checkOpenShift,
  };

  return <PosSessionContext.Provider value={value}>{children}</PosSessionContext.Provider>;
};
