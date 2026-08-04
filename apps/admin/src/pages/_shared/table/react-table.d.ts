/**
 * Module augmentation for @tanstack/react-table ColumnMeta.
 *
 * Extends the generic ColumnMeta interface so column definitions in this app
 * can carry display hints without casting to `any`.
 */
import "@tanstack/react-table";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Horizontal alignment for header and cell content. */
    align?: "left" | "right" | "center";
    /** Fixed CSS width for the column, e.g. "120px" or "10%". */
    width?: string;
    /** Stick this column to the left edge (z-index layering + bg fill). */
    pinnedLeft?: boolean;
    /** Stick this column to the right edge (z-index layering + bg fill). */
    pinnedRight?: boolean;
    /**
     * Plain-text label used in the mobile card fallback instead of the header
     * render function. Falls back to `columnDef.header` when it is a string.
     */
    headerLabel?: string;
  }
}
