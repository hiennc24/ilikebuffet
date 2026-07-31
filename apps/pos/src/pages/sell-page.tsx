/**
 * SellPage — POS sell screen shell (M1 scope).
 *
 * Render layout: sell-grid (left) + payment panel (right).
 * Actual menu data fetching and cart state are P7 scope.
 * Touch targets ≥48px everywhere (DECISION #8).
 */

import * as React from "react";
import { SellGridTile, PaymentPanel } from "@ilikebuffet/ui";
import type { OrderItem } from "@ilikebuffet/ui";

/* Static placeholder data for the M1 shell. Real data comes from P7. */
const PLACEHOLDER_ITEMS = [
  { id: "m1", name: "Lẩu thập cẩm", price: 185000 },
  { id: "m2", name: "Nước ngọt", price: 25000 },
  { id: "m3", name: "Phở bò", price: 75000 },
  { id: "m4", name: "Cơm gà", price: 55000 },
];

export const SellPage: React.FC = () => {
  const [cartItems, setCartItems] = React.useState<OrderItem[]>([]);

  const addToCart = React.useCallback(
    (id: string, name: string, unitPrice: number) => {
      setCartItems((prev) => {
        const existing = prev.find((i) => i.id === id);
        if (existing) {
          return prev.map((i) =>
            i.id === id ? { ...i, quantity: i.quantity + 1 } : i,
          );
        }
        return [...prev, { id, name, quantity: 1, unitPrice }];
      });
    },
    [],
  );

  const handleConfirm = React.useCallback(() => {
    // P7 will wire this to the actual payment flow + draft_bill update.
    // For M1 shell: clear cart as a placeholder.
    setCartItems([]);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - var(--touch-min, 48px))",
        overflow: "hidden",
      }}
    >
      {/* Sell grid */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--space-4)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "var(--space-3)",
          alignContent: "start",
        }}
      >
        {PLACEHOLDER_ITEMS.map((item) => (
          <SellGridTile
            key={item.id}
            name={item.name}
            price={item.price}
            onClick={() => addToCart(item.id, item.name, item.price)}
          />
        ))}
      </div>

      {/* Payment panel */}
      <div style={{ width: "300px", flexShrink: 0 }}>
        <PaymentPanel
          items={cartItems}
          onConfirm={handleConfirm}
        />
      </div>
    </div>
  );
};
