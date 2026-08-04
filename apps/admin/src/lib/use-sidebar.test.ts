/**
 * useSidebarCollapsed — module-singleton store tests.
 *
 * Between tests we clear localStorage and call _resetSidebarStore() to
 * re-initialise the singleton from storage (same pattern as theme tests).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSidebarCollapsed, _resetSidebarStore } from "./use-sidebar";

describe("useSidebarCollapsed", () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => { _resetSidebarStore(); });
  });

  afterEach(() => {
    localStorage.clear();
    act(() => { _resetSidebarStore(); });
  });

  it("defaults to expanded (collapsed === false) when no localStorage value", () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);
  });

  it("starts collapsed when localStorage preset to 'collapsed'", () => {
    localStorage.setItem("ibb_admin_sidebar", "collapsed");
    act(() => { _resetSidebarStore(); });
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(true);
  });

  it("starts expanded when localStorage preset to 'expanded'", () => {
    localStorage.setItem("ibb_admin_sidebar", "expanded");
    act(() => { _resetSidebarStore(); });
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);
  });

  it("toggle() flips collapsed from false to true", () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.collapsed).toBe(true);
  });

  it("toggle() writes 'collapsed' to localStorage", () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    act(() => {
      result.current.toggle();
    });

    expect(localStorage.getItem("ibb_admin_sidebar")).toBe("collapsed");
  });

  it("toggle() twice returns to original state", () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    act(() => {
      result.current.toggle();
    });
    expect(result.current.collapsed).toBe(true);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem("ibb_admin_sidebar")).toBe("expanded");
  });

  it("setCollapsed(true) collapses and persists", () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    act(() => {
      result.current.setCollapsed(true);
    });

    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem("ibb_admin_sidebar")).toBe("collapsed");
  });

  it("setCollapsed(false) expands and persists", () => {
    localStorage.setItem("ibb_admin_sidebar", "collapsed");
    act(() => { _resetSidebarStore(); });
    const { result } = renderHook(() => useSidebarCollapsed());

    act(() => {
      result.current.setCollapsed(false);
    });

    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem("ibb_admin_sidebar")).toBe("expanded");
  });

  it("multiple hook instances share the same state", () => {
    const { result: a } = renderHook(() => useSidebarCollapsed());
    const { result: b } = renderHook(() => useSidebarCollapsed());

    expect(a.current.collapsed).toBe(false);
    expect(b.current.collapsed).toBe(false);

    act(() => {
      a.current.toggle();
    });

    expect(a.current.collapsed).toBe(true);
    expect(b.current.collapsed).toBe(true);
  });
});
