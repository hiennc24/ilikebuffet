/**
 * useMediaQuery — subscribe to a CSS media query and re-render on change.
 *
 * The admin styles inline (React.CSSProperties), so responsive behaviour is driven
 * in JS rather than @media. Breakpoints match the design system: phone <768,
 * tablet 768–1023, desktop ≥1024. `useIsCompact()` is the shell's split point
 * (below desktop → off-canvas drawer nav).
 */
import * as React from "react";

const hasMatchMedia = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(() => (hasMatchMedia() ? window.matchMedia(query).matches : false));

  React.useEffect(() => {
    // No-op in environments without matchMedia (SSR, jsdom) — defaults to false (desktop).
    if (!hasMatchMedia()) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Breakpoint tokens (px). Keep in sync with the design system. */
export const BREAKPOINTS = { tablet: 768, desktop: 1024, wide: 1440 } as const;

/** True below the desktop breakpoint — the shell shows drawer nav instead of a fixed sidebar. */
export const useIsCompact = (): boolean => useMediaQuery(`(max-width: ${BREAKPOINTS.desktop - 1}px)`);
