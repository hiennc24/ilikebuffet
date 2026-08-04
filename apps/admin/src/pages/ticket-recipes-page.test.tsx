/**
 * TicketRecipesPage tests — loads a ticket type's recipe and saves edits.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/auth-context";
import { TicketRecipesPage } from "./ticket-recipes-page";

const TICKET_TYPES = [{ id: "tt-1", name: "Người lớn" }];
const INGREDIENTS = { data: [{ id: "ing-1", name: "Bò", unit: { code: "KG" } }, { id: "ing-2", name: "Gạo", unit: { code: "KG" } }] };
const RECIPE = { data: [{ ingredientId: "ing-1", ingredientName: "Bò", unitCode: "KG", qtyBase: 0.2 }] };

function makeFetch() {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (init?.method === "PUT" && path.startsWith("/inventory/recipes/tt-1")) return json(200, RECIPE);
    if (path.startsWith("/inventory/recipes")) return json(200, RECIPE);
    if (path.startsWith("/sales/ticket-types")) return json(200, TICKET_TYPES);
    if (path.startsWith("/master-data/ingredients")) return json(200, INGREDIENTS);
    if (path.startsWith("/branches")) return json(200, [{ id: "branch-9", code: "CN9", name: "Chi nhánh 9" }]);
    return json(404, { error: "not found" });
  }) as typeof globalThis.fetch;
}

/** A token whose middle segment decodes to a role, so decodeRole() works. */
const roleToken = (role: string) => `h.${btoa(JSON.stringify({ role })).replace(/\+/g, "-").replace(/\//g, "_")}.s`;

function seedAuth() {
  sessionStorage.setItem("ibb_admin_at", "at");
  sessionStorage.setItem("ibb_admin_rt", "rt");
  localStorage.setItem("ibb_admin_branch", "branch-1");
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AuthProvider apiBaseUrl="">{children}</AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("TicketRecipesPage", () => {
  beforeEach(() => {
    seedAuth();
    globalThis.fetch = makeFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("loads the recipe for the default ticket type", async () => {
    render(<TicketRecipesPage />, { wrapper });
    await waitFor(() => expect(screen.getByLabelText("Định mức 1")).toBeTruthy());
    expect((screen.getByLabelText("Định mức 1") as HTMLInputElement).value).toBe("0.2");
  });

  it("adds a line and saves via PUT", async () => {
    render(<TicketRecipesPage />, { wrapper });
    await waitFor(() => expect(screen.getByLabelText("Định mức 1")).toBeTruthy());

    fireEvent.click(screen.getByText("+ Thêm nguyên liệu"));
    fireEvent.change(screen.getByLabelText("Nguyên liệu 2"), { target: { value: "ing-2" } });
    fireEvent.change(screen.getByLabelText("Định mức 2"), { target: { value: "0.15" } });
    fireEvent.click(screen.getByText("Lưu định mức"));

    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          (c) => c[1]?.method === "PUT" && String(c[0]).includes("/inventory/recipes/tt-1"),
        ),
      ).toBe(true),
    );
  });
});

// Isolated block: a chain-wide user gets a per-branch scope selector (M7). Its
// own setup avoids the shared beforeEach so the QueryClient stays stable across
// re-renders (needed for the branches query to persist).
describe("TicketRecipesPage — branch scope", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lets a chain-wide user switch scope to a branch override", async () => {
    sessionStorage.setItem("ibb_admin_at", roleToken("QUAN_TRI_HQ"));
    sessionStorage.setItem("ibb_admin_rt", "rt");
    localStorage.setItem("ibb_admin_branch", "branch-1");
    globalThis.fetch = makeFetch();

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <AuthProvider apiBaseUrl="">
            <TicketRecipesPage />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    // Chain-wide users get the scope dropdown; wait for the branch option to load.
    await waitFor(() =>
      expect(screen.getAllByRole("option").some((o) => o.textContent?.includes("Chi nhánh 9"))).toBe(true),
    );

    fireEvent.change(screen.getByLabelText("Phạm vi"), { target: { value: "branch-9" } });
    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          (c) => c[1]?.method !== "PUT" && String(c[0]).includes("/inventory/recipes?ticketTypeId=tt-1&branchId=branch-9"),
        ),
      ).toBe(true),
    );
  });
});
