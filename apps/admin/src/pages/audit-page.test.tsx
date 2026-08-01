/**
 * AuditPage tests — list rendering, filter, and before/after detail drawer.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../auth/auth-context";
import { AuditPage } from "./audit-page";

const AUDIT = {
  data: [
    {
      id: "1",
      actorId: "u1",
      actorRole: "QUAN_LY_CN",
      action: "bill.cancel",
      objectType: "bill",
      objectId: "b1",
      branchId: "br1",
      deviceId: null,
      before: { status: "COMPLETED" },
      after: { status: "CANCELLED" },
      reason: "Khách đổi ý",
      approvedBy: "mgr1",
      createdAt: "2026-08-02T10:00:00+07:00",
    },
  ],
  total: 1,
};

function makeFetch(seen: string[] = []) {
  return vi.fn(async (url: string): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    seen.push(path);
    return new Response(JSON.stringify(AUDIT), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof globalThis.fetch;
}

function seedAuth() {
  sessionStorage.setItem("ibb_admin_at", "at");
  sessionStorage.setItem("ibb_admin_rt", "rt");
  localStorage.setItem("ibb_admin_branch", "br1");
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider apiBaseUrl="">{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("AuditPage", () => {
  beforeEach(() => seedAuth());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lists audit rows", async () => {
    globalThis.fetch = makeFetch();
    render(<AuditPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("bill.cancel")).toBeTruthy());
    expect(screen.getByText("Khách đổi ý")).toBeTruthy();
  });

  it("passes the action filter to the request", async () => {
    const seen: string[] = [];
    globalThis.fetch = makeFetch(seen);
    render(<AuditPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("bill.cancel")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Hành động"), { target: { value: "bill.refund" } });
    await waitFor(() => expect(seen.some((p) => p.includes("action=bill.refund"))).toBe(true));
  });

  it("opens a before/after detail drawer", async () => {
    globalThis.fetch = makeFetch();
    render(<AuditPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("bill.cancel")).toBeTruthy());

    fireEvent.click(screen.getByText("bill.cancel"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Nhật ký bill.cancel" })).toBeTruthy());
    // before/after JSON rendered (the section titles "Trước"/"Sau" collide with the
    // pagination buttons, so assert on the unique JSON content instead).
    expect(screen.getByText(/COMPLETED/)).toBeTruthy();
    expect(screen.getByText(/CANCELLED/)).toBeTruthy();
  });
});
