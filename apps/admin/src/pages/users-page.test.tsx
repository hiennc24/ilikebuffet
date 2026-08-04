/**
 * UsersPage tests — list, create (temp password shown once), and reset action.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { UsersPage } from "./users-page";

const USERS = {
  data: [
    { id: "u1", username: "hq", role: "QUAN_TRI_HQ", chainWide: true, mustChangePassword: false, lockedUntil: null, branches: [] },
    { id: "u2", username: "cashier1", role: "THU_NGAN", chainWide: false, mustChangePassword: true, lockedUntil: null, branches: [{ branchId: "b1" }] },
  ],
  total: 2,
};
const BRANCHES = { data: [{ id: "b1", code: "CN01", name: "Quận 1" }] };
const DB_ROLES = {
  data: [
    { code: "QUAN_TRI_HQ", name: "Quản trị HQ", isSystem: true, capabilities: [], userCount: 1 },
    { code: "THU_NGAN", name: "Thu ngân", isSystem: true, capabilities: [], userCount: 1 },
    { code: "THU_KHO", name: "Thủ kho", isSystem: true, capabilities: [], userCount: 0 },
    { code: "CHU_CHUOI", name: "Chủ chuỗi", isSystem: true, capabilities: [], userCount: 0 },
    { code: "KE_TOAN_CHUOI", name: "Kế toán chuỗi", isSystem: true, capabilities: [], userCount: 0 },
    { code: "QUAN_LY_CN", name: "Quản lý CN", isSystem: true, capabilities: [], userCount: 0 },
  ],
};

function makeFetch(calls: { method: string; path: string; body: unknown }[] = []) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const method = init?.method ?? "GET";
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/branches")) return json(200, BRANCHES);
    if (path.startsWith("/rbac/roles")) return json(200, DB_ROLES);
    if (path.includes("/reset-password")) {
      calls.push({ method, path, body: null });
      return json(201, { tempPassword: "TMP-abc123" });
    }
    if (path.startsWith("/users") && method === "POST") {
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      return json(201, { tempPassword: "NEW-xyz789", user: USERS.data[1] });
    }
    if (path.startsWith("/users")) return json(200, USERS);
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
    // MemoryRouter is required because UsersPage now calls useNavigate() for
    // the breadcrumb home button inside its own PageHeader chrome.
    <MemoryRouter initialEntries={["/settings/users"]}>
      <QueryClientProvider client={qc}>
        <AuthProvider apiBaseUrl="">{children}</AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("UsersPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lists users with role + scope", async () => {
    globalThis.fetch = makeFetch();
    render(<UsersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("cashier1")).toBeTruthy());
    expect(screen.getByText("Toàn chuỗi")).toBeTruthy();
  });

  it("creates a user and reveals the one-time temp password", async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    globalThis.fetch = makeFetch(calls);
    render(<UsersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("cashier1")).toBeTruthy());

    fireEvent.click(screen.getByText("Người dùng mới"));
    fireEvent.change(screen.getByLabelText("Tên đăng nhập *"), { target: { value: "newcashier" } });
    // THU_NGAN is default → needs a branch
    await waitFor(() => expect(screen.getByLabelText("Chi nhánh CN01")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Chi nhánh CN01"));
    fireEvent.click(screen.getByText("Tạo"));

    await waitFor(() => expect(screen.getByText("NEW-xyz789")).toBeTruthy());
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ username: "newcashier", role: "THU_NGAN", branchIds: ["b1"] });
  });

  it("resets a password from the detail drawer and shows the temp password", async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    globalThis.fetch = makeFetch(calls);
    render(<UsersPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("cashier1")).toBeTruthy());

    fireEvent.click(screen.getByText("cashier1"));
    await waitFor(() => expect(screen.getByText("Reset mật khẩu")).toBeTruthy());
    fireEvent.click(screen.getByText("Reset mật khẩu"));

    await waitFor(() => expect(screen.getByText(/TMP-abc123/)).toBeTruthy());
    expect(calls.some((c) => c.path.includes("/reset-password"))).toBe(true);
  });
});
