/**
 * IngredientsPage tests — list, create (with group/unit + purchase unit), import.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { IngredientsPage } from "./ingredients-page";

const UNITS = [{ id: "kg", code: "KG", name: "Kilogram" }, { id: "g", code: "G", name: "Gram" }];
const GROUPS = [{ id: "grp1", name: "Rau củ" }];
const INGREDIENTS = {
  data: [
    { id: "i1", code: "NL001", name: "Cà chua", groupId: "grp1", unitId: "kg", status: "ACTIVE", group: { name: "Rau củ" }, unit: { code: "KG" }, purchaseUnits: [] },
  ],
  total: 1,
};

function makeFetch(calls: { method: string; path: string; body: unknown; isForm: boolean }[] = []) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const method = init?.method ?? "GET";
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/master-data/units")) return json(200, UNITS);
    if (path.startsWith("/master-data/ingredient-groups")) return json(200, GROUPS);
    if (path.startsWith("/import/ingredients")) {
      calls.push({ method, path, body: null, isForm: init?.body instanceof FormData });
      return json(200, { validCount: 3, errorCount: 0, errors: [] });
    }
    if (path.startsWith("/master-data/ingredients") && (method === "POST" || method === "PUT")) {
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null, isForm: false });
      return json(201, { ...INGREDIENTS.data[0], id: "new" });
    }
    if (path.startsWith("/master-data/ingredients")) return json(200, INGREDIENTS);
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
    // MemoryRouter is required because IngredientsPage now uses ListPageShell
    // which calls useNavigate() for the breadcrumb home button.
    <MemoryRouter initialEntries={["/inventory"]}>
      <QueryClientProvider client={qc}>
        <AuthProvider apiBaseUrl="">{children}</AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("IngredientsPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lists ingredients with group + unit", async () => {
    globalThis.fetch = makeFetch();
    render(<IngredientsPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Cà chua")).toBeTruthy());
    expect(screen.getByText("NL001")).toBeTruthy();
  });

  it("creates an ingredient with a purchase unit", async () => {
    const calls: { method: string; path: string; body: unknown; isForm: boolean }[] = [];
    globalThis.fetch = makeFetch(calls);
    render(<IngredientsPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Cà chua")).toBeTruthy());

    fireEvent.click(screen.getByText("Nguyên liệu mới"));
    fireEvent.change(screen.getByLabelText("Tên *"), { target: { value: "Hành lá" } });
    fireEvent.click(screen.getByText("+ Thêm đơn vị mua"));
    fireEvent.change(screen.getByLabelText("Hệ số 1"), { target: { value: "1000" } });
    fireEvent.click(screen.getByText("Lưu"));

    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path.includes("/master-data/ingredients"))).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ name: "Hành lá", groupId: "grp1", unitId: "kg", purchaseUnits: [{ unitId: "kg", factorToBase: 1000 }] });
  });

  it("uploads an Excel file as multipart and shows the result", async () => {
    const calls: { method: string; path: string; body: unknown; isForm: boolean }[] = [];
    globalThis.fetch = makeFetch(calls);
    render(<IngredientsPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Cà chua")).toBeTruthy());

    const file = new File(["x"], "nl.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const input = screen.getByLabelText("Chọn file Excel") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Nhập 3 dòng hợp lệ/)).toBeTruthy());
    const imp = calls.find((c) => c.path.includes("/import/ingredients"))!;
    expect(imp.isForm).toBe(true);
  });
});
