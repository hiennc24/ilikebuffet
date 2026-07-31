/**
 * Button behavior tests (M6 — behavior, not color snapshots).
 *
 * What we test:
 *   1. action variant does NOT use terracotta in inline style (DECISION #1)
 *   2. touch prop produces ≥48px height (DECISION #8)
 *   3. disabled state prevents click
 *   4. all variants render without crashing
 *
 * We do NOT snapshot the rendered HTML — that would be brittle (M6).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../src/components/button";

// Terracotta hex values per DECISION #1 — none of these should appear on action.
const TERRACOTTA_HEX = ["#C96442", "#AC4E31", "#D4754F", "#B85B38", "c96442", "ac4e31"];

describe("Button — DECISION #1: no terracotta on action variant", () => {
  it("action variant inline style does not contain any terracotta hex", () => {
    const { container } = render(<Button variant="action">Đăng nhập</Button>);
    const btn = container.querySelector("button")!;
    const styleAttr = btn.getAttribute("style") ?? "";

    for (const hex of TERRACOTTA_HEX) {
      expect(styleAttr.toLowerCase()).not.toContain(hex.toLowerCase());
    }
  });

  it("action variant uses the lam-teal action token background, not a hardcoded terracotta", () => {
    const { container } = render(<Button variant="action">OK</Button>);
    const btn = container.querySelector("button")!;
    // The background must reference the CSS var, not a hardcoded terracotta.
    const style = btn.getAttribute("style") ?? "";
    expect(style).toContain("var(--action-bg)");
  });

  it("danger variant does not set variant=action data attribute", () => {
    const { container } = render(<Button variant="danger">Xoá</Button>);
    const btn = container.querySelector("button")!;
    expect(btn.dataset["variant"]).toBe("danger");
    expect(btn.dataset["variant"]).not.toBe("action");
  });
});

describe("Button — DECISION #8: touch target ≥ 48px", () => {
  it("touch prop sets data-touch attribute", () => {
    const { container } = render(<Button touch>Xác nhận</Button>);
    const btn = container.querySelector("button")!;
    expect(btn.dataset["touch"]).toBe("true");
  });

  it("touch prop applies var(--touch-min) height via inline style", () => {
    const { container } = render(<Button touch>Thanh toán</Button>);
    const btn = container.querySelector("button")!;
    const style = btn.getAttribute("style") ?? "";
    // Inline style must reference the touch-min token, not a small hardcoded px.
    expect(style).toContain("var(--touch-min");
  });

  it("non-touch button does not have data-touch attribute", () => {
    const { container } = render(<Button>Bình thường</Button>);
    const btn = container.querySelector("button")!;
    expect(btn.dataset["touch"]).toBeUndefined();
  });
});

describe("Button — behavior", () => {
  it("calls onClick when clicked", async () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Bấm</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not call onClick when disabled", async () => {
    const handler = vi.fn();
    render(
      <Button disabled onClick={handler}>
        Bấm
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["action", "ghost", "danger", "link"] as const)(
    "%s variant renders without error",
    (variant) => {
      expect(() =>
        render(<Button variant={variant}>Test</Button>),
      ).not.toThrow();
    },
  );
});
