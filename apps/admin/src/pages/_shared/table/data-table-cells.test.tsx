/**
 * data-table-cells tests — Badge tones, Avatar initials + image fallback.
 */
import * as React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, Avatar, MutedCell } from "./data-table-cells";
import type { BadgeTone } from "./data-table-cells";

// ── Badge ─────────────────────────────────────────────────────────────────────

describe("Badge", () => {
  const tones: BadgeTone[] = ["neutral", "success", "warn", "danger", "info"];

  it.each(tones)('renders tone "%s" with its label', (tone) => {
    render(<Badge tone={tone}>label-{tone}</Badge>);
    expect(screen.getByText(`label-${tone}`)).toBeInTheDocument();
  });

  it("uses --status-success-bg token for success tone", () => {
    const { container } = render(<Badge tone="success">ok</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.background).toBe("var(--status-success-bg)");
    expect(el.style.color).toBe("var(--status-success-text)");
  });

  it("uses --status-danger-bg token for danger tone", () => {
    const { container } = render(<Badge tone="danger">err</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.background).toBe("var(--status-danger-bg)");
  });

  it("defaults to neutral tone when no tone prop given", () => {
    const { container } = render(<Badge>default</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.background).toBe("var(--status-neutral-bg)");
  });
});

// ── Avatar ────────────────────────────────────────────────────────────────────

describe("Avatar", () => {
  it("shows initials when no src given — two-word name", () => {
    const { container } = render(<Avatar name="Hien Nguyen" />);
    expect(container.textContent).toBe("HN");
  });

  it("shows first two chars when single-word name", () => {
    const { container } = render(<Avatar name="Admin" />);
    expect(container.textContent).toBe("AD");
  });

  it("splits on @ for email addresses", () => {
    const { container } = render(<Avatar name="hien@example.com" />);
    // split on [@._-] → ["hien","example","com"] → first + last → "HC"
    expect(container.textContent).toBe("HC");
  });

  it("splits on . within email local part via the dot separator", () => {
    const { container } = render(<Avatar name="first.last" />);
    expect(container.textContent).toBe("FL");
  });

  it("renders an <img> when src is provided", () => {
    const { container } = render(<Avatar src="https://example.com/avatar.png" name="Alice" />);
    // The wrapper span is aria-hidden so getByRole won't find the img;
    // use DOM query instead.
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
    expect(img).toHaveAttribute("alt", "Alice");
  });

  it("does NOT render an <img> when src is null", () => {
    render(<Avatar src={null} name="Bob" />);
    expect(screen.queryByRole("img")).toBeNull();
    // Should show initials instead.
    // single word "Bob" → "BO"
  });

  it("applies custom size", () => {
    const { container } = render(<Avatar name="X" size={40} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("40px");
    expect(el.style.height).toBe("40px");
  });
});

// ── MutedCell ─────────────────────────────────────────────────────────────────

describe("MutedCell", () => {
  it("renders its children", () => {
    render(<MutedCell>secondary info</MutedCell>);
    expect(screen.getByText("secondary info")).toBeInTheDocument();
  });

  it("applies muted colour token", () => {
    const { container } = render(<MutedCell>text</MutedCell>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.color).toBe("var(--text-muted)");
  });
});
