/**
 * Toast tests — store push/dismiss/auto-dismiss, Toaster rendering, and the
 * MutationCache wiring (a mutation success/error produces a toast).
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, MutationCache, useMutation } from "@tanstack/react-query";
import { toast, dismiss, Toaster } from "./toast";
import { toErrorMessage } from "../pages/_shared/admin-ui";

describe("toast store + Toaster", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    // Flush pending auto-dismiss timers so the module-level store is clean.
    act(() => vi.runOnlyPendingTimers());
    vi.useRealTimers();
  });

  it("shows a pushed toast and auto-dismisses after the timeout", () => {
    render(<Toaster />);
    act(() => {
      toast.success("Đã lưu chi nhánh");
    });
    expect(screen.getByText("Đã lưu chi nhánh")).toBeTruthy();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText("Đã lưu chi nhánh")).toBeNull();
  });

  it("errors use role=alert and can be dismissed via the close button", () => {
    render(<Toaster />);
    let id = 0;
    act(() => {
      id = toast.error("Lưu thất bại");
    });
    expect(screen.getByRole("alert")).toBeTruthy();
    act(() => fireEvent.click(screen.getByLabelText("Đóng thông báo")));
    expect(screen.queryByText("Lưu thất bại")).toBeNull();
    act(() => dismiss(id)); // idempotent
  });
});

describe("MutationCache → toast", () => {
  const makeClient = () =>
    new QueryClient({
      defaultOptions: { mutations: { retry: false } },
      mutationCache: new MutationCache({
        onError: (error) => toast.error(toErrorMessage(error)),
        onSuccess: (_d, _v, _c, mutation) => {
          if (mutation.meta?.silent) return;
          toast.success((mutation.meta?.successMessage as string | undefined) ?? "Thành công");
        },
      }),
    });

  const Runner: React.FC<{ fn: () => Promise<unknown>; meta?: Record<string, unknown> }> = ({ fn, meta }) => {
    const m = useMutation({ mutationFn: fn, meta });
    return <button onClick={() => m.mutate()}>Chạy</button>;
  };

  const wrap = (ui: React.ReactNode) => (
    <QueryClientProvider client={makeClient()}>
      <Toaster />
      {ui}
    </QueryClientProvider>
  );

  afterEach(() => screen.queryAllByLabelText("Đóng thông báo").forEach((b) => fireEvent.click(b)));

  it("toasts the default success message on a successful mutation", async () => {
    render(wrap(<Runner fn={() => Promise.resolve("ok")} />));
    fireEvent.click(screen.getByText("Chạy"));
    await waitFor(() => expect(screen.getByText("Thành công")).toBeTruthy());
  });

  it("uses meta.successMessage when provided", async () => {
    render(wrap(<Runner fn={() => Promise.resolve("ok")} meta={{ successMessage: "Đã duyệt đơn" }} />));
    fireEvent.click(screen.getByText("Chạy"));
    await waitFor(() => expect(screen.getByText("Đã duyệt đơn")).toBeTruthy());
  });

  it("toasts the error message on a failed mutation", async () => {
    render(wrap(<Runner fn={() => Promise.reject({ status: 409, message: JSON.stringify({ message: "Vai trò còn người dùng" }) })} />));
    fireEvent.click(screen.getByText("Chạy"));
    await waitFor(() => expect(screen.getByText("Vai trò còn người dùng")).toBeTruthy());
  });
});
