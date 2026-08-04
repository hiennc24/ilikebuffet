/**
 * useMediaQuery — subscribe to a CSS media query and re-render on change.
 * SSR/jsdom-safe (no matchMedia → returns false). `useIsNarrow()` is the POS
 * split point: below it the sell screen stacks the cart under the product grid.
 */
import * as React from "react";

const hasMatchMedia = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(() => (hasMatchMedia() ? window.matchMedia(query).matches : false));

  React.useEffect(() => {
    if (!hasMatchMedia()) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True on phone-width screens — the sell layout stacks (cart below the grid). */
export const useIsNarrow = (): boolean => useMediaQuery("(max-width: 767px)");
