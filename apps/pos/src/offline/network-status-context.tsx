/**
 * NetworkStatusContext — tracks online/offline and triggers sync.
 *
 * On mount: calls navigator.storage.persist() and warns if denied.
 * Listens to window online/offline events.
 * When transitioning online: fires SyncEngine.triggerSync().
 *
 * Exposes:
 *   isOnline: boolean
 *   pendingCount: number  — bills waiting to sync
 *   triggerSync(): void   — manual trigger (e.g. after adding a bill)
 */

import * as React from "react";
import { usePosAuth } from "../auth/pos-auth-context";
import { usePosSession } from "../session/pos-session-context";
import { SyncEngine } from "./sync-engine";
import { countPending, hasStuckBills } from "./outbox-store";
import { measureSkew, type ClockSkew } from "./clock-skew";

export interface NetworkStatusContextValue {
  isOnline: boolean;
  pendingCount: number;
  persistenceGranted: boolean | null; // null = not yet checked
  /** Last measured device↔server clock skew. null = not yet measured. */
  clockSkew: ClockSkew | null;
  /** A bill has been waiting to sync >15 min while online (stuck sync warning). */
  stuckSync: boolean;
  triggerSync: () => void;
}

const NetworkStatusContext = React.createContext<NetworkStatusContextValue | null>(null);

export function useNetworkStatus(): NetworkStatusContextValue {
  const ctx = React.useContext(NetworkStatusContext);
  if (!ctx) throw new Error("useNetworkStatus must be used inside NetworkStatusProvider");
  return ctx;
}

export const NetworkStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { api } = usePosAuth();
  const { branchId } = usePosSession();

  const [isOnline, setIsOnline] = React.useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [persistenceGranted, setPersistenceGranted] = React.useState<boolean | null>(null);
  const [clockSkew, setClockSkew] = React.useState<ClockSkew | null>(null);
  const [stuckSync, setStuckSync] = React.useState(false);

  const engineRef = React.useRef<SyncEngine | null>(null);

  // Measure device↔server clock skew whenever we are (or become) online.
  const measure = React.useCallback(async () => {
    const skew = await measureSkew();
    if (skew) {
      setClockSkew(skew);
      if (skew.exceeded) {
        console.warn(`[POS] Clock skew ${Math.round(skew.offsetMs / 1000)}s exceeds tolerance`);
      }
    }
  }, []);

  // Refresh pending count + stuck-sync flag from Dexie.
  const refreshCount = React.useCallback(async () => {
    if (!branchId) return;
    const [count, stuck] = await Promise.all([countPending(branchId), hasStuckBills(branchId)]);
    setPendingCount(count);
    setStuckSync(stuck);
  }, [branchId]);

  // Lazy-init engine when branchId is known.
  React.useEffect(() => {
    if (!branchId) return;
    engineRef.current = new SyncEngine(api, branchId, {
      onSyncComplete: () => void refreshCount(),
      onSyncError: () => void refreshCount(),
    });
  }, [api, branchId, refreshCount]);

  // Request persistent storage on mount (C6).
  React.useEffect(() => {
    if (!navigator.storage?.persist) {
      setPersistenceGranted(false);
      return;
    }
    navigator.storage.persist().then((granted) => {
      setPersistenceGranted(granted);
      if (!granted) {
        console.warn("[POS] IndexedDB persistence NOT granted — offline data may be evicted (C6)");
      }
    });
  }, []);

  // Online/offline event listeners.
  React.useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      engineRef.current?.triggerSync();
      void refreshCount();
      void measure();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshCount]);

  // Refresh count on mount and when branchId changes.
  React.useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  // Measure clock skew on mount (if online).
  React.useEffect(() => {
    if (navigator.onLine) void measure();
  }, [measure]);

  const triggerSync = React.useCallback(() => {
    if (isOnline) {
      engineRef.current?.triggerSync();
    }
    void refreshCount();
  }, [isOnline, refreshCount]);

  const value: NetworkStatusContextValue = {
    isOnline,
    pendingCount,
    persistenceGranted,
    clockSkew,
    stuckSync,
    triggerSync,
  };

  return (
    <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>
  );
};
