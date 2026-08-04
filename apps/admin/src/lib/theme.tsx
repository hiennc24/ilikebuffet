/**
 * Theme module — light/dark mode for ilikebuffet Admin.
 *
 * - Persists choice to localStorage key `ibb_admin_theme`.
 * - Falls back to `prefers-color-scheme` on first visit.
 * - Applies `document.documentElement.dataset.theme = "dark"` (or removes it for light).
 * - Guards matchMedia for jsdom safety (same pattern as use-media-query.ts).
 */
import * as React from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "ibb_admin_theme";

function getSystemTheme(): Theme {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage blocked (private browsing, etc.)
  }
  return null;
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (theme === "dark") {
    document.documentElement.dataset.theme = "dark";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

/** Initialise the theme once, as early as possible (before first paint). */
export function initTheme(): Theme {
  const theme = readStoredTheme() ?? getSystemTheme();
  applyTheme(theme);
  return theme;
}

// Module-level store so all hooks share one subscription.
let _currentTheme: Theme = "light";
const _listeners = new Set<() => void>();

function setTheme(theme: Theme) {
  _currentTheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  applyTheme(theme);
  _listeners.forEach((fn) => fn());
}

/** Subscribe to theme changes. Returns an unsubscribe function. */
function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * `useTheme()` — returns `{ theme, toggle }`.
 * Must be called after `initTheme()` (or a ThemeProvider) has run.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setLocalTheme] = React.useState<Theme>(() => _currentTheme);

  React.useEffect(() => {
    // Sync in case initTheme ran between module load and first render.
    setLocalTheme(_currentTheme);
    return subscribe(() => setLocalTheme(_currentTheme));
  }, []);

  const toggle = React.useCallback(() => {
    setTheme(_currentTheme === "dark" ? "light" : "dark");
  }, []);

  return { theme, toggle };
}

/**
 * ThemeProvider — mounts once in the app, reads localStorage / prefers-color-scheme
 * and applies the theme on first layout effect (before paint where possible).
 */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  React.useLayoutEffect(() => {
    const initial = readStoredTheme() ?? getSystemTheme();
    _currentTheme = initial;
    applyTheme(initial);
    // Notify any hooks that mounted before this effect.
    _listeners.forEach((fn) => fn());
  }, []);

  return <>{children}</>;
};
