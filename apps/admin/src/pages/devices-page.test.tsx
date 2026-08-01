/**
 * DevicesPage tests — list + suspend action.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { DevicesPage } from "./devices-page";

const DEVICES = [
  { id: "d1", deviceId: "dev-uuid-1", branchId: "b1", label: "POS-01", status: "ACTIVE", createdAt: "2026-08-01T10:00:00+07:00" },
  { id: "d2", deviceId: "dev-uuid-2", branchId: "b1", label: null, status: "SUSPENDED", createdAt: "2026-08-01T11:00:00+07:00" },
];

function makeFetch(calls: string[] = []) {
  return vi.fn(async (url: string, _init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path.includes("/suspend")) {
      calls.push(path);
      return json(201, { ok: true });
    }
    if (path.startsWith("/platform/devices")) return json(200, DEVICES);
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

describe("DevicesPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lists devices with status", async () => {
    globalThis.fetch = makeFetch();
    render(<DevicesPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("POS-01")).toBeTruthy());
    expect(screen.getByText("dev-uuid-2")).toBeTruthy();
  });

  it("suspends an active device from the drawer", async () => {
    const calls: string[] = [];
    globalThis.fetch = makeFetch(calls);
    render(<DevicesPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("POS-01")).toBeTruthy());

    fireEvent.click(screen.getByText("POS-01"));
    await waitFor(() => expect(screen.getByText("Tạm ngưng thiết bị")).toBeTruthy());
    fireEvent.click(screen.getByText("Tạm ngưng thiết bị"));

    await waitFor(() => expect(calls.some((p) => p.includes("/platform/devices/dev-uuid-1/suspend"))).toBe(true));
  });
});
