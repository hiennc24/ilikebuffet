/**
 * PageHeader unit tests.
 *
 * Covers:
 *   - breadcrumb structure (home link + group text + h1 current page)
 *   - "/" root path shows only the title h1, no home link
 *   - actions slot renders
 *   - toolbar renders; PageTabs onChange fires on click
 *   - collapse helper (>4 raw crumbs → home, …, lastParent, page)
 */

import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PageHeader, PageTabs, collapseCrumbs } from "./page-header";

// ── collapseCrumbs ────────────────────────────────────────────────────────────

describe("collapseCrumbs", () => {
  it("does not collapse when ≤ maxVisible crumbs", () => {
    const crumbs = [
      { label: "Home", path: "/" },
      { label: "Group" },
      { label: "Page", isCurrent: true },
    ];
    expect(collapseCrumbs(crumbs, 4)).toEqual(crumbs);
  });

  it("collapses middle parents when > maxVisible crumbs", () => {
    const crumbs = [
      { label: "Home", path: "/" },
      { label: "A" },
      { label: "B" },
      { label: "C" },
      { label: "Page", isCurrent: true },
    ];
    const collapsed = collapseCrumbs(crumbs, 4);
    expect(collapsed).toHaveLength(4);
    expect(collapsed[0].label).toBe("Home");
    expect(collapsed[1].label).toBe("…");
    expect(collapsed[2].label).toBe("C");
    expect(collapsed[3].label).toBe("Page");
  });

  it("keeps exactly home + … + lastParent + page for 5 crumbs", () => {
    const crumbs = [
      { label: "Home", path: "/" },
      { label: "Level1" },
      { label: "Level2" },
      { label: "Level3" },
      { label: "Page", isCurrent: true },
    ];
    const result = collapseCrumbs(crumbs, 4);
    const labels = result.map((c) => c.label);
    expect(labels).toEqual(["Home", "…", "Level3", "Page"]);
  });
});

// ── PageHeader ────────────────────────────────────────────────────────────────

describe("PageHeader", () => {
  it("renders home link, group text, and big h1 title for a nested route", () => {
    render(
      <PageHeader
        activePath="/monitor"
        pageTitle="Theo dõi ca"
        onNavigate={vi.fn()}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });

    // Home crumb — clickable button.
    expect(within(nav).getByRole("button", { name: "Tổng quan" })).toBeInTheDocument();

    // No intermediate group crumb (2-level DTV breadcrumb).
    expect(within(nav).queryByText("Vận hành")).toBeNull();

    // Current page: h1 with aria-current="page".
    const heading = within(nav).getByRole("heading", { name: "Theo dõi ca" });
    expect(heading.getAttribute("aria-current")).toBe("page");
  });

  it("renders big h1 inside the nav element", () => {
    render(
      <PageHeader
        activePath="/monitor"
        pageTitle="Theo dõi ca"
        onNavigate={vi.fn()}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    // h1 must be a descendant of the nav.
    expect(within(nav).getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("calls onNavigate('/') when the home crumb is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <PageHeader
        activePath="/monitor"
        pageTitle="Theo dõi ca"
        onNavigate={onNavigate}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    fireEvent.click(within(nav).getByRole("button", { name: "Tổng quan" }));
    expect(onNavigate).toHaveBeenCalledWith("/");
  });

  it("shows only the h1 title on the root path '/'", () => {
    render(
      <PageHeader
        activePath="/"
        pageTitle="Tổng quan"
        onNavigate={vi.fn()}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    // No home button — only the h1.
    expect(within(nav).queryByRole("button", { name: "Tổng quan" })).toBeNull();
    const heading = within(nav).getByRole("heading", { name: "Tổng quan" });
    expect(heading.getAttribute("aria-current")).toBe("page");
  });

  it("renders the actions slot", () => {
    render(
      <PageHeader
        activePath="/"
        pageTitle="Tổng quan"
        onNavigate={vi.fn()}
        actions={<button type="button">Tạo mới</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Tạo mới" })).toBeInTheDocument();
  });

  it("renders the toolbar slot", () => {
    render(
      <PageHeader
        activePath="/"
        pageTitle="Tổng quan"
        onNavigate={vi.fn()}
        toolbar={<div data-testid="toolbar">Tabs here</div>}
      />,
    );
    expect(screen.getByTestId("toolbar")).toBeInTheDocument();
  });

  it("shows group from reports section", () => {
    render(
      <PageHeader
        activePath="/reports/revenue"
        pageTitle="Báo cáo doanh thu"
        onNavigate={vi.fn()}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).queryByText("Báo cáo & Đối soát")).toBeNull();
    expect(within(nav).getByRole("heading", { name: "Báo cáo doanh thu" })).toBeInTheDocument();
  });
});

// ── PageTabs ──────────────────────────────────────────────────────────────────

describe("PageTabs", () => {
  const ITEMS = [
    { value: "all", label: "Tất cả", count: 10 },
    { value: "active", label: "Đang hoạt động" },
    { value: "inactive", label: "Ngừng hoạt động" },
  ];

  it("renders tab buttons with correct roles and aria-selected", () => {
    render(<PageTabs items={ITEMS} value="all" onChange={vi.fn()} />);
    const tablist = screen.getByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
  });

  it("calls onChange with the tab value on click", () => {
    const onChange = vi.fn();
    render(<PageTabs items={ITEMS} value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: /đang hoạt động/i }));
    expect(onChange).toHaveBeenCalledWith("active");
  });

  it("renders count pill", () => {
    render(<PageTabs items={ITEMS} value="all" onChange={vi.fn()} />);
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
