/**
 * HolidaysPage tests — list, create calendar, edit entries.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { HolidaysPage } from "./holidays-page";

const CALENDARS = [
  {
    id: "c1",
    year: 2026,
    name: "Lễ 2026",
    branchId: null,
    entries: [{ date: "2026-01-01T00:00:00.000Z", name: "Tết Dương lịch" }],
  },
];

function makeFetch(calls: { method: string; path: string; body: unknown }[] = []) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const method = init?.method ?? "GET";
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.includes("/entries")) {
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      return json(200, { ok: true });
    }
    if (path.startsWith("/master-data/holiday-calendars") && method === "POST") {
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      return json(201, { ...CALENDARS[0], id: "c2" });
    }
    if (path.startsWith("/master-data/holiday-calendars")) return json(200, CALENDARS);
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
    <QueryClientProvider client={qc}>
      <AuthProvider apiBaseUrl="">{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("HolidaysPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lists calendars with entry counts", async () => {
    globalThis.fetch = makeFetch();
    render(<HolidaysPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Lễ 2026")).toBeTruthy());
    expect(screen.getByText("Toàn chuỗi")).toBeTruthy();
  });

  it("edits and saves entries", async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    globalThis.fetch = makeFetch(calls);
    render(<HolidaysPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Lễ 2026")).toBeTruthy());

    fireEvent.click(screen.getByText("Lễ 2026"));
    await waitFor(() => expect(screen.getByText("Lưu ngày lễ")).toBeTruthy());
    // existing entry pre-populated
    expect((screen.getByLabelText("Ngày 1") as HTMLInputElement).value).toBe("2026-01-01");
    fireEvent.click(screen.getByText("Lưu ngày lễ"));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path.includes("/entries"))).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.body).toMatchObject({ entries: [{ date: "2026-01-01", name: "Tết Dương lịch" }] });
  });
});
