/**
 * data-table tests — integration of DataTable + useDataTable.
 *
 * Covers: row rendering, sort toggle, row selection, loading skeletons,
 * empty state, error state, onRowClick.
 *
 * matchMedia is stubbed (compact=false → desktop layout) so useIsCompact
 * returns false throughout, matching the admin-shell.test.tsx pattern.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./data-table";
import { useDataTable } from "./use-data-table";
import { DataTableColumnHeader } from "./data-table-column-header";
import { createSelectionColumn } from "./column-helpers";
import { parseSortString, buildSortString } from "./use-data-table";

// ── matchMedia stub (desktop — compact=false) ─────────────────────────────────

function stubMatchMedia(compact: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: query.includes("max-width") ? compact : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  );
}

beforeEach(() => stubMatchMedia(false));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Fixture ───────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number;
}

const ROWS: Product[] = [
  { id: "1", name: "Bún bò", price: 65000 },
  { id: "2", name: "Phở gà", price: 55000 },
  { id: "3", name: "Cơm tấm", price: 45000 },
];

function makeColumns(opts: { sortable?: boolean } = {}): ColumnDef<Product>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) =>
        opts.sortable ? (
          <DataTableColumnHeader column={column} title="Tên món" />
        ) : (
          "Tên món"
        ),
      enableSorting: opts.sortable ?? false,
    },
    {
      id: "price",
      accessorKey: "price",
      header: "Giá",
      enableSorting: false,
      meta: { align: "right" },
    },
  ];
}

// ── Harness component ─────────────────────────────────────────────────────────

function TableHarness({
  data = ROWS,
  total = ROWS.length,
  sortable = false,
  isLoading = false,
  isError = false,
  onRowClick,
  enableRowSelection = false,
  initialSort = null,
  onSortChange,
}: {
  data?: Product[];
  total?: number;
  sortable?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRowClick?: (row: Product) => void;
  enableRowSelection?: boolean;
  initialSort?: string | null;
  onSortChange?: (sort: string | null) => void;
}) {
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(10);
  const [sort, setSort] = React.useState<string | null>(initialSort);

  const handleSetSort = (s: string | null) => {
    setSort(s);
    onSortChange?.(s);
  };

  const columns = React.useMemo(
    () =>
      enableRowSelection
        ? [createSelectionColumn<Product>(), ...makeColumns({ sortable })]
        : makeColumns({ sortable }),
    [sortable, enableRowSelection],
  );

  const table = useDataTable<Product>({
    data,
    columns,
    total,
    page,
    limit,
    sort,
    setPage,
    setLimit,
    setSort: handleSetSort,
    getRowId: (row) => row.id,
    enableRowSelection,
  });

  return <DataTable table={table} isLoading={isLoading} isError={isError} onRowClick={onRowClick} />;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DataTable — row rendering", () => {
  it("renders all data rows", () => {
    render(<TableHarness />);
    expect(screen.getByText("Bún bò")).toBeInTheDocument();
    expect(screen.getByText("Phở gà")).toBeInTheDocument();
    expect(screen.getByText("Cơm tấm")).toBeInTheDocument();
  });

  it("renders column headers", () => {
    render(<TableHarness />);
    expect(screen.getByText("Tên món")).toBeInTheDocument();
    expect(screen.getByText("Giá")).toBeInTheDocument();
  });
});

describe("DataTable — sorting", () => {
  it("calls setSort with 'name.asc' on first click of a sortable header", () => {
    const onSortChange = vi.fn();
    render(<TableHarness sortable onSortChange={onSortChange} />);
    fireEvent.click(screen.getByRole("button", { name: /tên món/i }));
    expect(onSortChange).toHaveBeenCalledWith("name.asc");
  });

  it("calls setSort with 'name.desc' on second click (toggle asc→desc)", () => {
    const onSortChange = vi.fn();
    render(
      <TableHarness sortable onSortChange={onSortChange} initialSort="name.asc" />,
    );
    // Already asc → next click toggles to desc.
    fireEvent.click(screen.getByRole("button", { name: /tên món/i }));
    expect(onSortChange).toHaveBeenCalledWith("name.desc");
  });
});

describe("DataTable — row selection", () => {
  it("checking a row checkbox marks it selected", () => {
    render(<TableHarness enableRowSelection />);
    const checkboxes = screen.getAllByRole("checkbox", { name: "Chọn hàng" });
    expect(checkboxes.length).toBe(ROWS.length);
    fireEvent.click(checkboxes[0]);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
  });

  it("select-all checkbox checks all rows", () => {
    render(<TableHarness enableRowSelection />);
    const selectAll = screen.getByRole("checkbox", { name: "Chọn tất cả" });
    fireEvent.click(selectAll);
    const rowCheckboxes = screen.getAllByRole("checkbox", { name: "Chọn hàng" });
    rowCheckboxes.forEach((cb) => {
      expect((cb as HTMLInputElement).checked).toBe(true);
    });
  });
});

describe("DataTable — loading state", () => {
  it("renders skeleton rows instead of data when isLoading=true", () => {
    render(<TableHarness isLoading />);
    // Data rows should not appear.
    expect(screen.queryByText("Bún bò")).toBeNull();
    // There should be no real data cells — skeletons are divs with inline shimmer style.
    // Check there's at least one shimmer div.
    const { container } = render(<TableHarness isLoading />);
    const shimmerDivs = container.querySelectorAll(
      'div[style*="var(--bg-sunken)"]',
    );
    expect(shimmerDivs.length).toBeGreaterThan(0);
  });
});

describe("DataTable — empty state", () => {
  it("shows the default empty message when data is empty", () => {
    render(<TableHarness data={[]} total={0} />);
    expect(screen.getByText("Chưa có dữ liệu.")).toBeInTheDocument();
  });

  it("renders a custom empty node when provided", () => {
    function Harness() {
      const [page, setPage] = React.useState(1);
      const [limit, setLimit] = React.useState(10);
      const [sort, setSort] = React.useState<string | null>(null);
      const table = useDataTable<Product>({
        data: [],
        columns: makeColumns(),
        total: 0,
        page,
        limit,
        sort,
        setPage,
        setLimit,
        setSort: setSort,
        getRowId: (r) => r.id,
      });
      return (
        <DataTable
          table={table}
          empty={<p>Không có sản phẩm nào.</p>}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByText("Không có sản phẩm nào.")).toBeInTheDocument();
  });
});

describe("DataTable — error state", () => {
  it("shows error message when isError=true", () => {
    render(<TableHarness isError />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/đã xảy ra lỗi/i)).toBeInTheDocument();
  });
});

describe("DataTable — row click", () => {
  it("fires onRowClick with the row data when a row is clicked", () => {
    const onRowClick = vi.fn();
    render(<TableHarness onRowClick={onRowClick} />);
    // Click the first data row (click on its first cell text).
    fireEvent.click(screen.getByText("Bún bò"));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
  });

  it("fires onRowClick on Enter key press", () => {
    const onRowClick = vi.fn();
    render(<TableHarness onRowClick={onRowClick} />);
    const rows = screen.getAllByRole("button");
    // First data row with role=button.
    fireEvent.keyDown(rows[0], { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});

// ── Sort string helpers unit tests ────────────────────────────────────────────

describe("parseSortString", () => {
  it("parses 'field.asc' to SortingState", () => {
    expect(parseSortString("name.asc")).toEqual([{ id: "name", desc: false }]);
  });

  it("parses 'field.desc' to SortingState", () => {
    expect(parseSortString("created_at.desc")).toEqual([
      { id: "created_at", desc: true },
    ]);
  });

  it("handles field names containing dots", () => {
    // e.g. "meta.price.asc" → id = "meta.price", desc = false
    expect(parseSortString("meta.price.asc")).toEqual([
      { id: "meta.price", desc: false },
    ]);
  });

  it("returns [] for null", () => {
    expect(parseSortString(null)).toEqual([]);
  });

  it("returns [] for invalid string", () => {
    expect(parseSortString("justfield")).toEqual([]);
  });
});

describe("buildSortString", () => {
  it("builds 'field.asc' from asc SortingState", () => {
    expect(buildSortString([{ id: "name", desc: false }])).toBe("name.asc");
  });

  it("builds 'field.desc' from desc SortingState", () => {
    expect(buildSortString([{ id: "price", desc: true }])).toBe("price.desc");
  });

  it("returns null for empty SortingState", () => {
    expect(buildSortString([])).toBeNull();
  });

  it("uses only the first sort entry", () => {
    expect(
      buildSortString([
        { id: "name", desc: false },
        { id: "price", desc: true },
      ]),
    ).toBe("name.asc");
  });
});
