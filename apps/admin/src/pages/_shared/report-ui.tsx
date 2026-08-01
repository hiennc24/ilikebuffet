/**
 * report-ui — report-specific presentational bits (KPI, date-range filter, totals).
 *
 * Sits on the design tokens alongside admin-ui. Reuses admin-ui's DataTable/Card
 * for the actual tables; this module only adds what reports need.
 */
import * as React from "react";
import { formatVnd } from "@ilikebuffet/shared";
import { Select } from "./admin-ui";

// ── KPI card ────────────────────────────────────────────────────────────────

export const KpiCard: React.FC<{ label: string; value: string; sub?: string; tone?: "default" | "warn" }> = ({ label, value, sub, tone = "default" }) => (
  <div
    style={{
      flex: 1,
      minWidth: "160px",
      background: "var(--bg-raised, #FFFFFF)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)",
      padding: "var(--space-4)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-1)",
    }}
  >
    <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
    <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xl)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"], color: tone === "warn" ? "#B4472C" : "var(--text-primary)" }}>{value}</span>
    {sub && <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{sub}</span>}
  </div>
);

export const KpiRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>{children}</div>
);

/** Format an integer đồng KPI value. */
export const vnd = (n: number) => formatVnd(n);

// ── Date-range + branch filter ────────────────────────────────────────────────

export interface ReportFilter {
  from: string;
  to: string;
  branchId: string;
}
export interface Branch {
  id: string;
  code: string;
  name?: string;
}

/**
 * DateRangeBar — from/to dates + an optional branch select (shown when
 * `branches` is provided, i.e. the caller is chain-wide). Presentational: the
 * parent owns the filter state and fetches the branch list.
 */
export const DateRangeBar: React.FC<{
  value: ReportFilter;
  onChange: (patch: Partial<ReportFilter>) => void;
  branches?: Branch[];
  right?: React.ReactNode;
}> = ({ value, onChange, branches, right }) => (
  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
    <label style={labelStyle}>
      Từ ngày
      <input type="date" aria-label="Từ ngày" value={value.from} onChange={(e) => onChange({ from: e.target.value })} />
    </label>
    <label style={labelStyle}>
      Đến ngày
      <input type="date" aria-label="Đến ngày" value={value.to} onChange={(e) => onChange({ to: e.target.value })} />
    </label>
    {branches && (
      <Select aria-label="Chi nhánh" value={value.branchId} onChange={(e) => onChange({ branchId: e.target.value })}>
        <option value="">Tất cả chi nhánh</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.code}
            {b.name ? ` — ${b.name}` : ""}
          </option>
        ))}
      </Select>
    )}
    {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
  </div>
);

// ── Totals footer ────────────────────────────────────────────────────────────

export const TotalsBar: React.FC<{ items: { label: string; value: string; tone?: "default" | "warn" }[] }> = ({ items }) => (
  <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", padding: "var(--space-3) 0", borderTop: "1px solid var(--border-default)", marginTop: "var(--space-2)" }}>
    {items.map((it) => (
      <div key={it.label} style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}>{it.label}</span>
        <span style={{ fontSize: "var(--text-base)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"], color: it.tone === "warn" ? "#B4472C" : "var(--text-primary)", fontFamily: "var(--font-sans)" }}>{it.value}</span>
      </div>
    ))}
  </div>
);

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)", fontFamily: "var(--font-sans)" };
