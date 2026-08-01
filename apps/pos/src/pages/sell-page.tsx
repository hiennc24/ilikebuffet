/**
 * SellPage — real POS sell screen (P7).
 *
 * - Fetches active ticket types from GET /sales/ticket-types
 * - Resolves estimated unit price per type via POST /sales/pricing/resolve
 * - Cart state persisted to Dexie (H8: survives refresh/lock)
 * - Hydrates cart from Dexie on mount
 * - Opens PayDialog on "Thanh toán"
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { SellGridTile, PaymentPanel, Button } from "@ilikebuffet/ui";
import type { OrderItem } from "@ilikebuffet/ui";
import { ShiftBillsPanel } from "./shift-bills-panel";
import { usePosAuth } from "../auth/pos-auth-context";
import { usePosSession } from "../session/pos-session-context";
import {
  getActiveDraft,
  saveDraft,
  clearDraft,
  getOrCreateClientUuid,
  clearClientUuid,
} from "../db/draft-bill-store";
import { refreshCatalog, getCachedCatalog } from "../offline/catalog-cache";
import { resolveOfflinePrice } from "../offline/offline-pricing";
import type { PriceBookSnapshot } from "@ilikebuffet/shared";
import { PayDialog } from "./pay-dialog";

// ── API types ──────────────────────────────────────────────────────────────

interface TicketType {
  id: string;
  name: string;
  color?: string;
  displayOrder: number;
  isFree: boolean;
  status: string;
}

interface PriceResolveResult {
  kind: "PRICE" | "NO_PRICE";
  priceVnd?: number;
}

interface TicketTypeWithPrice extends TicketType {
  unitPrice: number;
}

// ── Hooks ──────────────────────────────────────────────────────────────────

function useTicketTypesWithPrices(branchId: string | null) {
  const { api } = usePosAuth();

  return useQuery<TicketTypeWithPrice[]>({
    queryKey: ["ticket-types-with-prices", branchId],
    enabled: !!branchId,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const types = await api.get<TicketType[]>("/sales/ticket-types");
        const active = types.filter((t) => t.status === "ACTIVE");

        const now = new Date().toISOString();
        const prices = await Promise.all(
          active.map((t) =>
            t.isFree
              ? Promise.resolve<PriceResolveResult>({ kind: "PRICE", priceVnd: 0 })
              : api
                  .post<PriceResolveResult>("/sales/pricing/resolve", {
                    branchId,
                    ticketTypeId: t.id,
                    createdAt: now,
                  })
                  .catch((): PriceResolveResult => ({ kind: "NO_PRICE" })),
          ),
        );

        // Refresh the offline catalog cache so the device can price offline later.
        if (branchId) void refreshCatalog(api, branchId);

        return active
          .map((t, i) => ({
            ...t,
            unitPrice: prices[i].kind === "PRICE" ? (prices[i].priceVnd ?? 0) : 0,
          }))
          .sort((a, b) => a.displayOrder - b.displayOrder);
      } catch (err) {
        // Offline: price from the cached catalog with the same shared resolver.
        const cached = branchId ? await getCachedCatalog(branchId) : null;
        if (!cached) throw err;
        const snapshot = cached.snapshot as PriceBookSnapshot;
        const now = new Date();
        return cached.ticketTypes
          .map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            displayOrder: t.displayOrder,
            isFree: t.isFree,
            status: "ACTIVE",
            unitPrice: t.isFree ? 0 : resolveOfflinePrice(snapshot, branchId!, t, now) ?? 0,
          }))
          .sort((a, b) => a.displayOrder - b.displayOrder);
      }
    },
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export const SellPage: React.FC = () => {
  const { selectedBranchId } = usePosAuth();
  const { branchId } = usePosSession();
  const effectiveBranchId = branchId ?? selectedBranchId;

  const { data: ticketTypes = [], isLoading, error } = useTicketTypesWithPrices(effectiveBranchId);

  const [cartItems, setCartItems] = React.useState<OrderItem[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const [billsOpen, setBillsOpen] = React.useState(false);

  // Hydrate cart from Dexie on mount (or when branch changes).
  React.useEffect(() => {
    if (!effectiveBranchId) {
      setHydrated(true);
      return;
    }
    setHydrated(false);
    getActiveDraft(effectiveBranchId).then((draft) => {
      if (draft && draft.items.length > 0) {
        setCartItems(
          draft.items.map((item) => ({
            id: item.menuItemId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        );
      }
      setHydrated(true);
    });
  }, [effectiveBranchId]);

  // Persist cart to Dexie on every change (after hydration).
  React.useEffect(() => {
    if (!hydrated || !effectiveBranchId) return;
    saveDraft(
      effectiveBranchId,
      cartItems.map((item) => ({
        menuItemId: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    );
  }, [cartItems, hydrated, effectiveBranchId]);

  const addToCart = React.useCallback((type: TicketTypeWithPrice) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.id === type.id);
      if (existing) {
        return prev.map((i) =>
          i.id === type.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        { id: type.id, name: type.name, quantity: 1, unitPrice: type.unitPrice },
      ];
    });
  }, []);

  const clientUuid = effectiveBranchId
    ? getOrCreateClientUuid(effectiveBranchId)
    : "";

  const handlePaymentSuccess = React.useCallback(() => {
    if (effectiveBranchId) {
      clearDraft(effectiveBranchId);
      clearClientUuid(effectiveBranchId);
    }
    setCartItems([]);
    setPayOpen(false);
  }, [effectiveBranchId]);

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 48px)",
          color: "var(--text-muted)",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
        }}
      >
        Đang tải thực đơn…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 48px)",
          color: "#C0392B",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
        }}
      >
        Không tải được thực đơn — thử lại
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - var(--touch-min, 48px))",
          overflow: "hidden",
        }}
      >
        {/* Action bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "var(--space-2) var(--space-4)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <Button variant="ghost" touch onClick={() => setBillsOpen(true)}>
            Bill trong ca
          </Button>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
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
          {ticketTypes.map((type) => (
            <SellGridTile
              key={type.id}
              name={type.name}
              price={type.unitPrice}
              onClick={() => addToCart(type)}
            />
          ))}
          {ticketTypes.length === 0 && (
            <p
              style={{
                gridColumn: "1/-1",
                color: "var(--text-muted)",
                fontSize: "var(--text-sm)",
                textAlign: "center",
                paddingTop: "var(--space-8)",
              }}
            >
              Không có loại vé nào
            </p>
          )}
        </div>

        {/* Payment panel */}
        <div style={{ width: "300px", flexShrink: 0 }}>
          <PaymentPanel
            items={cartItems}
            onConfirm={() => setPayOpen(true)}
            disabled={cartItems.length === 0}
          />
        </div>
        </div>
      </div>

      {payOpen && effectiveBranchId && (
        <PayDialog
          open={payOpen}
          onClose={() => setPayOpen(false)}
          cartItems={cartItems}
          clientUuid={clientUuid}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      <ShiftBillsPanel open={billsOpen} onClose={() => setBillsOpen(false)} />
    </>
  );
};
