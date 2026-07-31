/**
 * SellGridTile — POS menu item tile for the sell grid.
 *
 * Touch target: enforces 48×48px minimum per DECISION #8.
 * Used in the POS sell screen (M1 scope).
 * DataTable and reporting widgets are DEFERRED (H10).
 */

import * as React from "react";

export interface SellGridTileProps {
  name: string;
  price: number;
  /** Image URL; falls back to initials placeholder. */
  imageUrl?: string;
  available?: boolean;
  onClick?: () => void;
}

/** Format VND without raw division — price is already integer đồng. */
function formatVnd(amount: number): string {
  return amount.toLocaleString("vi-VN") + "₫";
}

export const SellGridTile: React.FC<SellGridTileProps> = ({
  name,
  price,
  imageUrl,
  available = true,
  onClick,
}) => {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <button
      type="button"
      disabled={!available}
      onClick={onClick}
      aria-label={`${name} — ${formatVnd(price)}`}
      data-testid="sell-grid-tile"
      style={{
        /* Touch target ≥48×48px (DECISION #8) */
        minWidth: "var(--touch-min, 48px)",
        minHeight: "var(--touch-min, 48px)",
        width: "100%",
        aspectRatio: "3 / 4",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        background: available ? "var(--bg-raised, #FFFFFF)" : "var(--bg-sunken)",
        cursor: available ? "pointer" : "not-allowed",
        opacity: available ? 1 : 0.5,
        overflow: "hidden",
        padding: 0,
        transition: "box-shadow var(--dur-fast) var(--ease-calm)",
        boxShadow: "var(--shadow-xs)",
        fontFamily: "var(--font-sans)",
        textAlign: "left",
      }}
    >
      {/* Image or placeholder */}
      <div
        aria-hidden="true"
        style={{
          flex: "1 1 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: imageUrl ? undefined : "var(--bg-sunken)",
          backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          color: "var(--text-muted)",
          fontSize: "var(--text-lg)",
          fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
          letterSpacing: "var(--tracking-wide)",
        }}
      >
        {!imageUrl && initials}
      </div>

      {/* Name + price footer */}
      <div
        style={{
          padding: "var(--space-2) var(--space-3)",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
        }}
      >
        <span
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-secondary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatVnd(price)}
        </span>
      </div>
    </button>
  );
};
