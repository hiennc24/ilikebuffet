/**
 * Sidebar collapsed/expanded state — module-singleton store.
 *
 * Mirrors the pattern in theme.tsx:
 *   - Module-level state + listener set for shared subscriptions.
 *   - Persists to localStorage key `ibb_admin_sidebar` ("collapsed" | "expanded").
 *   - Defaults to "expanded" on first visit.
 *   - Guards `typeof window` and wraps localStorage in try/catch for jsdom/SSR safety.
 */
import * as React from "react";

const STORAGE_KEY = "ibb_admin_sidebar";

function readStored(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function writeStored(collapsed: boolean): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // ignore
  }
}

// Module-level singleton — all hook instances share one state + subscription set.
let _collapsed: boolean = readStored();
const _listeners = new Set<() => void>();

function _notify(): void {
  _listeners.forEach((fn) => fn());
}

function _setCollapsed(value: boolean): void {
  _collapsed = value;
  writeStored(value);
  _notify();
}

function _subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _getSnapshot(): boolean {
  return _collapsed;
}

/**
 * Exposed for test reset only — re-reads localStorage and re-initialises the
 * module singleton without module re-load (mirrors what theme tests need).
 */
export function _resetSidebarStore(): void {
  _collapsed = readStored();
  _notify();
}

/**
 * `useSidebarCollapsed()` — returns `{ collapsed, toggle, setCollapsed }`.
 *
 * `collapsed` is true when the desktop sidebar is in rail (icon-only) mode.
 * Has no effect on compact/mobile (the caller gates rail behaviour with `!compact`).
 */
export function useSidebarCollapsed(): {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
} {
  const collapsed = React.useSyncExternalStore(_subscribe, _getSnapshot, () => false);

  const toggle = React.useCallback(() => {
    _setCollapsed(!_collapsed);
  }, []);

  const setCollapsed = React.useCallback((v: boolean) => {
    _setCollapsed(v);
  }, []);

  return { collapsed, toggle, setCollapsed };
}
