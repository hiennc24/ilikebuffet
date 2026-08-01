/**
 * NetworkStatusContext — tracks online/offline and triggers sync (P8 / BH-05).
 *
 * On mount: calls navigator.storage.persist() and warns if denied (C6).
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
import { countPending } from "./outbox-store";

export interface NetworkStatusContextValue {
  isOnline: boolean;
  pendingCount: number;
  persistenceGranted: boolean | null; // null = not yet checked
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

  const engineRef = React.useRef<SyncEngine | null>(null);

  // Refresh pending count from Dexie.
  const refreshCount = React.useCallback(async () => {
    if (!branchId) return;
    const count = await countPending(branchId);
    setPendingCount(count);
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
    triggerSync,
  };

  return (
    <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>
  );
};
