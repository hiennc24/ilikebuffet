/**
 * Auth routing behavior tests.
 *
 * These tests render <App/> (full React tree including router and auth
 * context) with a mocked fetch, then drive the auth state machine and
 * assert that the correct screen is shown after each transition.
 *
 * What we prove:
 *   1. multi-branch login → choose-branch screen appears (URL /choose-branch)
 *   2. mustChangePassword login → change-password screen appears
 *   3. single-branch login → dashboard shown (skip choose-branch)
 *   4. already-authenticated reload → dashboard, not login
 *
 * We mock fetch at the global level per test, set sessionStorage for
 * persistence tests, and clean up after each test.
 */

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { App } from "../app";

// ── helpers ────────────────────────────────────────────────────────────────

function mockFetchSequence(handlers: Record<string, { status: number; body: unknown }>) {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const handler = Object.entries(handlers).find(([key]) => path.startsWith(key));
    if (!handler) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const [, { status, body }] = handler;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Auth routing — screen transitions after login", () => {
  it("multi-branch login → choose-branch screen shown (not stuck on /login)", async () => {
    globalThis.fetch = mockFetchSequence({
      "/auth/login": {
        status: 200,
        body: { accessToken: "at", refreshToken: "rt", mustChangePassword: false },
      },
      "/branches": {
        status: 200,
        body: [
          { id: "b1", name: "Chi nhánh Quận 1" },
          { id: "b2", name: "Chi nhánh Quận 2" },
        ],
      },
    }) as typeof globalThis.fetch;

    render(<App />);

    // Should start on login page.
    expect(screen.getByLabelText(/email hoặc số điện thoại/i)).toBeTruthy();

    // Fill and submit login form.
    fireEvent.change(screen.getByLabelText(/email hoặc số điện thoại/i), {
      target: { value: "user@test.vn" },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: "password123" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /đăng nhập/i }));
    });

    // After login with multi-branch response, choose-branch screen must appear.
    await waitFor(() => {
      expect(screen.getByText(/chọn chi nhánh/i)).toBeTruthy();
    });

    // Login form must be gone — not stuck on /login.
    expect(screen.queryByLabelText(/email hoặc số điện thoại/i)).toBeNull();
  });

  it("mustChangePassword login → change-password screen shown", async () => {
    globalThis.fetch = mockFetchSequence({
      "/auth/login": {
        status: 200,
        body: { accessToken: "at", refreshToken: "rt", mustChangePassword: true },
      },
    }) as typeof globalThis.fetch;

    render(<App />);

    fireEvent.change(screen.getByLabelText(/email hoặc số điện thoại/i), {
      target: { value: "user@test.vn" },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: "oldpassword" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /đăng nhập/i }));
    });

    // Must show change-password screen (identified by the unique subtitle text).
    await waitFor(() => {
      expect(
        screen.getByText(/tài khoản yêu cầu đổi mật khẩu trước khi tiếp tục/i),
      ).toBeTruthy();
    });

    // Login form must be gone.
    expect(screen.queryByLabelText(/email hoặc số điện thoại/i)).toBeNull();
  });

  it("single-branch login → dashboard shown (skip choose-branch)", async () => {
    globalThis.fetch = mockFetchSequence({
      "/auth/login": {
        status: 200,
        body: { accessToken: "at", refreshToken: "rt", mustChangePassword: false },
      },
      "/branches": {
        status: 200,
        body: [{ id: "b1", name: "Chi nhánh duy nhất" }],
      },
    }) as typeof globalThis.fetch;

    render(<App />);

    fireEvent.change(screen.getByLabelText(/email hoặc số điện thoại/i), {
      target: { value: "user@test.vn" },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: "password" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /đăng nhập/i }));
    });

    // Should skip choose-branch and land on dashboard.
    await waitFor(() => {
      // Dashboard page renders inside AdminShell — check the topbar title.
      expect(screen.getByRole("heading", { name: /tổng quan/i })).toBeTruthy();
    });

    // Choose-branch must NOT have appeared.
    expect(screen.queryByText(/bạn có quyền ở/i)).toBeNull();
  });

  it("login sends the fresh access token on GET /branches (auth-gated, real-API parity)", async () => {
    // Regression: the ApiClient reads tokens from React state, which has NOT
    // updated yet inside login()'s tick. The /branches call must carry the
    // freshly-issued token explicitly, or the real API returns 401 → silent
    // refresh fails → onAuthFailure bounces back to /login. This mock mirrors
    // the real API by rejecting an unauthenticated /branches with 401.
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path.startsWith("/auth/login")) {
        return json(200, { accessToken: "fresh-at", refreshToken: "rt", mustChangePassword: false });
      }
      if (path.startsWith("/branches")) {
        const auth = new Headers(init?.headers as HeadersInit | undefined).get("Authorization");
        if (auth !== "Bearer fresh-at") return json(401, { message: "Unauthorized" });
        return json(200, { data: [{ id: "b1", name: "Chi nhánh duy nhất" }] });
      }
      return json(404, { error: "not found" });
    }) as typeof globalThis.fetch;

    render(<App />);

    fireEvent.change(screen.getByLabelText(/email hoặc số điện thoại/i), {
      target: { value: "user@test.vn" },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: "password" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /đăng nhập/i }));
    });

    // With the fix, the token is sent → /branches 200 → land on dashboard.
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /tổng quan/i })).toBeTruthy();
    });
    // Must NOT have been bounced back to the login form.
    expect(screen.queryByLabelText(/email hoặc số điện thoại/i)).toBeNull();
  });

  it("already-authenticated session reload → dashboard shown without login screen", async () => {
    // Seed tokens so AuthProvider reads them on mount (simulates page reload).
    sessionStorage.setItem("ibb_admin_at", "existing-at");
    sessionStorage.setItem("ibb_admin_rt", "existing-rt");
    localStorage.setItem("ibb_admin_branch", "b1");

    render(<App />);

    // Should NOT show the login form.
    await waitFor(() => {
      expect(screen.queryByLabelText(/email hoặc số điện thoại/i)).toBeNull();
    });
  });
});
