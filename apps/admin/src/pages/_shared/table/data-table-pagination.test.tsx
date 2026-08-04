/**
 * data-table-pagination tests — page-size select, prev/next/number buttons,
 * total display. Uses a minimal react-table instance via useReactTable directly.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
} from "@tanstack/react-table";
import { DataTablePagination } from "./data-table-pagination";

// ── Fixture ───────────────────────────────────────────────────────────────────

interface Item {
  id: string;
  name: string;
}

const COLUMNS: ColumnDef<Item>[] = [
  { id: "name", accessorKey: "name", header: "Tên" },
];

function makeRows(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({ id: String(i), name: `Item ${i}` }));
}

// ── Wrapper component so we can control pagination state ──────────────────────

function PaginationHarness({
  total,
  initialPage = 0,
  initialPageSize = 10,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  initialPage?: number;
  initialPageSize?: number;
  pageSizeOptions?: number[];
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const [pagination, setPagination] = React.useState({
    pageIndex: initialPage,
    pageSize: initialPageSize,
  });

  const table = useReactTable<Item>({
    data: makeRows(initialPageSize),
    columns: COLUMNS,
    pageCount: Math.ceil(total / pagination.pageSize),
    state: { pagination },
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
      if (next.pageSize !== pagination.pageSize) onPageSizeChange?.(next.pageSize);
      else onPageChange?.(next.pageIndex + 1); // expose 1-based to spy
      setPagination(next);
    },
  });

  return (
    <DataTablePagination
      table={table}
      total={total}
      pageSizeOptions={pageSizeOptions}
    />
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DataTablePagination", () => {
  it("renders the total record count", () => {
    render(<PaginationHarness total={83} />);
    expect(screen.getByText(/83/)).toBeInTheDocument();
  });

  it("calls setLimit (onPageSizeChange) when page size select changes", () => {
    const onPageSizeChange = vi.fn();
    render(
      <PaginationHarness
        total={100}
        pageSizeOptions={[10, 20, 50]}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    const select = screen.getByRole("combobox", { name: /số hàng/i });
    fireEvent.change(select, { target: { value: "20" } });
    expect(onPageSizeChange).toHaveBeenCalledWith(20);
  });

  it("calls setPage (onPageChange) when Next button clicked", () => {
    const onPageChange = vi.fn();
    render(<PaginationHarness total={50} initialPage={0} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls setPage when Prev button clicked from page 2", () => {
    const onPageChange = vi.fn();
    render(<PaginationHarness total={50} initialPage={1} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("disables Prev on first page", () => {
    render(<PaginationHarness total={50} initialPage={0} />);
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeDisabled();
  });

  it("disables Next on last page", () => {
    // total 20 / pageSize 10 = 2 pages; start on page index 1 (last page).
    render(<PaginationHarness total={20} initialPage={1} initialPageSize={10} />);
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();
  });

  it("navigates to a specific page when a numbered button is clicked", () => {
    const onPageChange = vi.fn();
    // Start at page index 2 (page 3 of 10) so the window includes page buttons
    // on both sides: buildPageWindow(3, 10) → [1, 2, 3, 4, "…", 10].
    render(
      <PaginationHarness
        total={100}
        initialPage={2}
        initialPageSize={10}
        onPageChange={onPageChange}
      />,
    );
    // Page 4 is adjacent and visible in the window.
    fireEvent.click(screen.getByRole("button", { name: "Trang 4" }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it("does not render page buttons when only one page exists", () => {
    render(<PaginationHarness total={5} initialPage={0} initialPageSize={10} />);
    expect(screen.queryByRole("button", { name: "Trang 1" })).toBeNull();
  });

  it("shows ellipsis for large page counts", () => {
    render(<PaginationHarness total={300} initialPage={4} initialPageSize={10} />);
    // page 5 of 30 — should have at least one ellipsis
    const ellipses = screen.getAllByText("…");
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });
});
