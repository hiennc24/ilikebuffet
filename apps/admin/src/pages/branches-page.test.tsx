/**
 * BranchesPage tests — list, create dialog, edit + status controls.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { BranchesPage } from "./branches-page";

const BRANCHES = [
  { id: "b1", code: "CN01", name: "Chi nhánh Quận 1", address: "1 Lê Lợi", phone: "0900000001", status: "ACTIVE" },
  { id: "b2", code: "CN02", name: "Chi nhánh Quận 3", address: "3 Nam Kỳ", phone: "0900000002", status: "SUSPENDED" },
];

function makeFetch(onPost?: (body: unknown) => void) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/branches") && (init?.method === "POST" || init?.method === "PUT")) {
      onPost?.(init.body ? JSON.parse(String(init.body)) : null);
      return json(201, { ...BRANCHES[0], id: "new" });
    }
    if (path.startsWith("/branches")) return json(200, { data: BRANCHES, total: 2 });
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
    // MemoryRouter is required because BranchesPage now calls useNavigate() for
    // the breadcrumb home button inside its own ListPageShell chrome.
    <MemoryRouter initialEntries={["/settings/branches"]}>
      <QueryClientProvider client={qc}>
        <AuthProvider apiBaseUrl="">{children}</AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("BranchesPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lists branches with status badges", async () => {
    globalThis.fetch = makeFetch();
    render(<BranchesPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Chi nhánh Quận 1")).toBeTruthy());
    expect(screen.getByText("CN02")).toBeTruthy();
    // "Tạm ngưng" also appears as a filter <option>, so assert the badge count.
    expect(screen.getAllByText("Tạm ngưng").length).toBeGreaterThanOrEqual(1);
  });

  it("submits a new branch from the create dialog", async () => {
    const posted: unknown[] = [];
    globalThis.fetch = makeFetch((b) => posted.push(b));
    render(<BranchesPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Chi nhánh Quận 1")).toBeTruthy());

    fireEvent.click(screen.getByText("Chi nhánh mới"));
    fireEvent.change(screen.getByLabelText("Mã *"), { target: { value: "CN09" } });
    fireEvent.change(screen.getByLabelText("Tên *"), { target: { value: "CN Mới" } });
    fireEvent.change(screen.getByLabelText("Địa chỉ *"), { target: { value: "9 Test" } });
    fireEvent.change(screen.getByLabelText("SĐT *"), { target: { value: "0900000009" } });
    fireEvent.change(screen.getByLabelText("Ngưỡng duyệt đơn mua (VND)"), { target: { value: "5000000" } });
    fireEvent.click(screen.getByText("Lưu"));

    await waitFor(() => expect(posted).toHaveLength(1));
    // Threshold posts as an integer (not the string from the input).
    expect(posted[0]).toMatchObject({ code: "CN09", name: "CN Mới", poApprovalThresholdVnd: 5_000_000 });
  });

  it("validates required fields", async () => {
    globalThis.fetch = makeFetch();
    render(<BranchesPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Chi nhánh Quận 1")).toBeTruthy());
    fireEvent.click(screen.getByText("Chi nhánh mới"));
    fireEvent.click(screen.getByText("Lưu"));
    expect(screen.getByText("Nhập đủ mã, tên, địa chỉ, SĐT")).toBeTruthy();
  });

  it("opens the edit dialog with status controls on row click", async () => {
    globalThis.fetch = makeFetch();
    render(<BranchesPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Chi nhánh Quận 1")).toBeTruthy());
    fireEvent.click(screen.getByText("Chi nhánh Quận 1"));
    await waitFor(() => expect(screen.getByText("Sửa chi nhánh CN01")).toBeTruthy());
    expect(screen.getByLabelText("Đổi trạng thái")).toBeTruthy();
    expect(screen.getByText("Cập nhật trạng thái")).toBeTruthy();
  });
});
