/**
 * admin-ui tests — the P0 list-screen primitives (Pagination, DetailDrawer, FilterBar).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Pagination, DetailDrawer, FilterBar, DataTable, Column } from "./admin-ui";

describe("Pagination", () => {
  it("shows page/total and disables prev on the first page", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageCount={3} total={42} onPageChange={onPageChange} />);
    expect(screen.getByText("Trang 1/3 · 42 mục")).toBeTruthy();
    expect(screen.getByLabelText("Trước")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Sau")).toHaveProperty("disabled", false);
  });

  it("disables next on the last page", () => {
    render(<Pagination page={3} pageCount={3} total={42} onPageChange={vi.fn()} />);
    expect(screen.getByLabelText("Sau")).toHaveProperty("disabled", true);
  });

  it("emits the target page on click", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={3} total={42} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByLabelText("Sau"));
    expect(onPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByLabelText("Trước"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});

describe("DetailDrawer", () => {
  it("renders nothing when closed", () => {
    render(
      <DetailDrawer open={false} title="Chi tiết" onClose={vi.fn()}>
        <p>content</p>
      </DetailDrawer>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders content + footer when open", () => {
    render(
      <DetailDrawer open title="Chi tiết đơn" onClose={vi.fn()} footer={<button>Huỷ</button>}>
        <p>nội dung</p>
      </DetailDrawer>,
    );
    expect(screen.getByRole("dialog", { name: "Chi tiết đơn" })).toBeTruthy();
    expect(screen.getByText("nội dung")).toBeTruthy();
    expect(screen.getByText("Huỷ")).toBeTruthy();
  });

  it("closes on the close button and on Escape", () => {
    const onClose = vi.fn();
    render(
      <DetailDrawer open title="X" onClose={onClose}>
        <p>c</p>
      </DetailDrawer>,
    );
    fireEvent.click(screen.getByLabelText("Đóng"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("FilterBar", () => {
  it("renders filter children and right-aligned actions", () => {
    render(
      <FilterBar actions={<button>Tạo</button>}>
        <span>filter</span>
      </FilterBar>,
    );
    expect(screen.getByText("filter")).toBeTruthy();
    expect(screen.getByText("Tạo")).toBeTruthy();
  });
});

describe("DataTable responsive", () => {
  interface Row {
    id: string;
    name: string;
    total: string;
  }
  const rows: Row[] = [{ id: "1", name: "Chi nhánh A", total: "1.000.000" }];
  const columns: Column<Row>[] = [
    { key: "name", header: "Tên", render: (r) => r.name },
    { key: "total", header: "Doanh thu", align: "right", render: (r) => r.total },
  ];
  const stubMatchMedia = (compact: boolean) =>
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("max-width") ? compact : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }));

  afterEach(() => vi.unstubAllGlobals());

  it("renders a table at desktop width", () => {
    stubMatchMedia(false);
    const { container } = render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(container.querySelector("table")).toBeTruthy();
    expect(screen.getByText("Chi nhánh A")).toBeTruthy();
  });

  it("renders label:value cards (no table) on compact widths", () => {
    stubMatchMedia(true);
    const { container } = render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(container.querySelector("table")).toBeNull();
    expect(screen.getByText("Doanh thu")).toBeTruthy();
    expect(screen.getByText("1.000.000")).toBeTruthy();
  });
});
