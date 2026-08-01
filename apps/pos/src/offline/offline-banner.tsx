/**
 * OfflineBanner — red bar shown when device is offline or has pending sync bills.
 *
 * Shows:
 *   - "Đang offline — X bill chờ đồng bộ" when offline with pending bills.
 *   - "Đang offline" when offline with no pending bills.
 *   - "Đang đồng bộ X bill…" when online but pendingCount > 0.
 *   - Nothing when online and pendingCount === 0.
 *
 * Persistence warning: shown once per session if storage.persist() was denied (C6).
 */

import * as React from "react";
import { useNetworkStatus } from "./network-status-context";

export const OfflineBanner: React.FC = () => {
  const { isOnline, pendingCount, persistenceGranted, clockSkew, stuckSync } = useNetworkStatus();

  const showPersistWarning = persistenceGranted === false;
  const showOffline = !isOnline;
  const showSyncing = isOnline && pendingCount > 0;
  const showSkewWarning = clockSkew?.exceeded === true;
  const showStuckWarning = isOnline && stuckSync;

  if (!showOffline && !showSyncing && !showPersistWarning && !showSkewWarning && !showStuckWarning) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
      }}
    >
      {(showOffline || showSyncing) && (
        <div
          style={{
            background: showOffline ? "#C0392B" : "var(--action-bg, #235B54)",
            color: "#FFFFFF",
            padding: "var(--space-2) var(--space-4)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <span aria-hidden="true">{showOffline ? "●" : "↑"}</span>
          {showOffline
            ? pendingCount > 0
              ? `Đang offline — ${pendingCount} bill chờ đồng bộ`
              : "Đang offline"
            : `Đang đồng bộ ${pendingCount} bill…`}
        </div>
      )}

      {showPersistWarning && (
        <div
          role="alert"
          style={{
            background: "#E67E22",
            color: "#FFFFFF",
            padding: "var(--space-2) var(--space-4)",
            fontSize: "var(--text-xs)",
          }}
        >
          Cảnh báo: Trình duyệt có thể xóa dữ liệu offline. Liên hệ quản trị viên để cấp quyền lưu trữ.
        </div>
      )}

      {showStuckWarning && (
        <div
          role="alert"
          style={{
            background: "#C0392B",
            color: "#FFFFFF",
            padding: "var(--space-2) var(--space-4)",
            fontSize: "var(--text-xs)",
          }}
        >
          Cảnh báo: Có bill chờ đồng bộ quá 15 phút. Kiểm tra kết nối / báo quản lý.
        </div>
      )}

      {showSkewWarning && (
        <div
          role="alert"
          style={{
            background: "#E67E22",
            color: "#FFFFFF",
            padding: "var(--space-2) var(--space-4)",
            fontSize: "var(--text-xs)",
          }}
        >
          Cảnh báo: Đồng hồ thiết bị lệch giờ máy chủ (
          {Math.round((clockSkew?.offsetMs ?? 0) / 1000)}s). Chỉnh lại giờ trước khi bán offline — bill lệch giờ sẽ bị giữ để đối soát.
        </div>
      )}
    </div>
  );
};
