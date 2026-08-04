/**
 * PermissionsPage tests — roles list, editor dialog, grouped capability tree,
 * create-role POST, and group-select toggle.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { PermissionsPage } from "./permissions-page";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CAPABILITIES = {
  groups: [
    {
      key: "cash",
      label: "Thu-chi & Công nợ",
      actions: [
        { key: "cash:read", label: "Xem thu-chi & công nợ" },
        { key: "cash:create", label: "Tạo phiếu thu-chi" },
      ],
    },
    {
      key: "report",
      label: "Báo cáo",
      actions: [{ key: "report:read", label: "Xem báo cáo" }],
    },
  ],
};

const ROLES = {
  data: [
    {
      code: "QUAN_TRI_HQ",
      name: "Quản trị HQ",
      description: null,
      isSystem: true,
      capabilities: ["cash:read", "cash:create", "report:read"],
      userCount: 1,
    },
    {
      code: "MY_CUSTOM",
      name: "Tùy chỉnh A",
      description: "Vai trò tùy chỉnh",
      isSystem: false,
      capabilities: ["cash:read"],
      userCount: 0,
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFetch(calls: { method: string; path: string; body: unknown }[] = []) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    if (path.startsWith("/rbac/capabilities")) return json(200, CAPABILITIES);
    if (path.startsWith("/rbac/roles") && method === "POST") {
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      return json(201, { code: "NEW_ROLE", name: "Mới", description: null, isSystem: false, capabilities: [], userCount: 0 });
    }
    if (path.startsWith("/rbac/roles")) return json(200, ROLES);
    return json(404, { error: "not found" });
  }) as typeof globalThis.fetch;
}

function seedAuth() {
  sessionStorage.setItem("ibb_admin_at", "at");
  sessionStorage.setItem("ibb_admin_rt", "rt");
  localStorage.setItem("ibb_admin_branch", "b1");
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    // MemoryRouter is required because PermissionsPage now calls useNavigate()
    // via ListPageShell's internal PageHeader breadcrumb chrome.
    <MemoryRouter initialEntries={["/settings/permissions"]}>
      <QueryClientProvider client={qc}>
        <AuthProvider apiBaseUrl="">{children}</AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PermissionsPage", () => {
  beforeEach(() => {
    seedAuth();
    globalThis.fetch = makeFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("renders the role list with system badge and custom badge", async () => {
    render(<PermissionsPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Quản trị HQ")).toBeTruthy());
    // System role badge appears
    expect(screen.getByText("Hệ thống")).toBeTruthy();
    // Custom role shows in list
    expect(screen.getByText("Tùy chỉnh A")).toBeTruthy();
    expect(screen.getByText("Tuỳ chỉnh")).toBeTruthy();
  });

  it("opens the editor on row click and shows grouped VN action labels", async () => {
    render(<PermissionsPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Quản trị HQ")).toBeTruthy());

    fireEvent.click(screen.getByText("Quản trị HQ"));

    // Wait for capabilities to load inside dialog
    await waitFor(() => expect(screen.getByText("Xem thu-chi & công nợ")).toBeTruthy());
    // VN group label renders
    expect(screen.getByText("Thu-chi & Công nợ")).toBeTruthy();
    expect(screen.getByText("Tạo phiếu thu-chi")).toBeTruthy();
    expect(screen.getByText("Xem báo cáo")).toBeTruthy();
    // Raw keys must NOT be shown as labels
    expect(screen.queryByText("cash:read")).toBeNull();
  });

  it("creates a role and POSTs to /rbac/roles", async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    globalThis.fetch = makeFetch(calls);
    render(<PermissionsPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Quản trị HQ")).toBeTruthy());

    fireEvent.click(screen.getByText("Vai trò mới"));

    // Wait for dialog to open and capabilities to load
    await waitFor(() => expect(screen.getByText("Xem thu-chi & công nợ")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Mã *"), { target: { value: "KY_THUAT" } });
    fireEvent.change(screen.getByLabelText("Tên *"), { target: { value: "Kỹ thuật" } });

    // Select the "Xem thu-chi & công nợ" action
    fireEvent.click(screen.getByLabelText("Xem thu-chi & công nợ"));

    fireEvent.click(screen.getByText("Lưu"));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBeTruthy());
    const posted = calls.find((c) => c.method === "POST")!.body as { code: string; name: string; capabilities: string[] };
    expect(posted.code).toBe("KY_THUAT");
    expect(posted.name).toBe("Kỹ thuật");
    expect(posted.capabilities).toContain("cash:read");
  });

  it("selecting a group checkbox selects all its child actions", async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    globalThis.fetch = makeFetch(calls);
    render(<PermissionsPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Quản trị HQ")).toBeTruthy());

    fireEvent.click(screen.getByText("Vai trò mới"));
    await waitFor(() => expect(screen.getByText("Thu-chi & Công nợ")).toBeTruthy());

    // Toggle the group checkbox for "Thu-chi & Công nợ"
    fireEvent.click(screen.getByLabelText("Chọn tất cả nhóm Thu-chi & Công nợ"));

    // Fill required fields and save
    fireEvent.change(screen.getByLabelText("Mã *"), { target: { value: "TEST_ROLE" } });
    fireEvent.change(screen.getByLabelText("Tên *"), { target: { value: "Test" } });
    fireEvent.click(screen.getByText("Lưu"));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBeTruthy());
    const posted = calls.find((c) => c.method === "POST")!.body as { capabilities: string[] };
    // Both actions in the group should be selected
    expect(posted.capabilities).toContain("cash:read");
    expect(posted.capabilities).toContain("cash:create");
  });
});
