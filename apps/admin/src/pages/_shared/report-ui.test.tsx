/**
 * report-ui tests — KpiCard, DateRangeBar, TotalsBar.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KpiCard, DateRangeBar, TotalsBar } from "./report-ui";

describe("KpiCard", () => {
  it("renders label, value, sub", () => {
    render(<KpiCard label="Doanh thu" value="1.000.000 ₫" sub="hôm nay" />);
    expect(screen.getByText("Doanh thu")).toBeTruthy();
    expect(screen.getByText("1.000.000 ₫")).toBeTruthy();
    expect(screen.getByText("hôm nay")).toBeTruthy();
  });
});

describe("DateRangeBar", () => {
  it("emits from/to changes", () => {
    const onChange = vi.fn();
    render(<DateRangeBar value={{ from: "", to: "", branchId: "" }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-08-01" } });
    expect(onChange).toHaveBeenCalledWith({ from: "2026-08-01" });
  });

  it("shows a branch select only when branches are provided", () => {
    const { rerender } = render(<DateRangeBar value={{ from: "", to: "", branchId: "" }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Chi nhánh")).toBeNull();
    rerender(<DateRangeBar value={{ from: "", to: "", branchId: "" }} onChange={vi.fn()} branches={[{ id: "b1", code: "CN01" }]} />);
    expect(screen.getByLabelText("Chi nhánh")).toBeTruthy();
  });
});

describe("TotalsBar", () => {
  it("renders total items", () => {
    render(<TotalsBar items={[{ label: "Net", value: "900.000 ₫" }, { label: "Lệch", value: "-50.000 ₫", tone: "warn" }]} />);
    expect(screen.getByText("Net")).toBeTruthy();
    expect(screen.getByText("-50.000 ₫")).toBeTruthy();
  });
});
