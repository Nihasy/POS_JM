/**
 * Store Zustand — Panier de vente.
 *
 * Gère l'état du panier courant : lignes, recherche, remises, paiements.
 * Les calculs métier (paliers, totaux) sont délégués à core/domain/pricing.
 */

import { create } from 'zustand';
import type { UUID, CartLine } from '@/core/domain/types';
import { lineTotal, saleTotal } from '@/core/domain/pricing';

interface CartState {
  /** Lignes du panier */
  lines: CartLine[];

  /** Remise globale */
  discountGlobalPercent: number | null;
  discountGlobalAmount: number | null;

  /** Client sélectionné pour crédit */
  customerId: UUID | null;
  customerName: string | null;

  /** Statut */
  isSuspended: boolean;

  /** Totaux calculés */
  subtotal: number;
  total: number;

  /** Nombre d'articles (pour badge) */
  itemCount: number;

  /** Actions */
  addItem: (params: {
    itemId: UUID;
    name: string;
    sellingPrice: number;
    costPrice: number;
    priceSemiGros?: number | null;
    priceGros?: number | null;
    qtySemiGros?: number | null;
    qtyGros?: number | null;
    unitName?: string;
    isKit?: boolean;
    quantity?: number;
  }) => void;
  updateQuantity: (tempId: string, quantity: number) => void;
  updateNegotiatedPrice: (tempId: string, price: number) => void;
  updateLineDiscount: (tempId: string, percent: number | null, amount: number | null) => void;
  removeItem: (tempId: string) => void;
  setGlobalDiscount: (percent: number | null, amount: number | null) => void;
  setCustomer: (id: UUID | null, name: string | null) => void;
  clearCart: () => void;
  recalc: () => void;
  setSuspended: (suspended: boolean) => void;
  loadCart: (lines: CartLine[], customerId?: UUID | null, customerName?: string | null) => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  discountGlobalPercent: null,
  discountGlobalAmount: null,
  customerId: null,
  customerName: null,
  isSuspended: false,
  subtotal: 0,
  total: 0,
  itemCount: 0,

  addItem: (params) => {
    const { lines } = get();

    // Vérifier si l'article existe déjà (même item, même prix de base → cumuler)
    const existing = lines.find(
      (l) =>
        l.itemId === params.itemId &&
        l.unitPrice === params.sellingPrice &&
        !l.discountPercent &&
        !l.discountAmount
    );

    const qty = params.quantity ?? 1;

    if (existing) {
      // Cumuler la quantité
      const newQty = existing.quantity + qty;

      // Recalculer avec la nouvelle quantité
      const result = lineTotal({
        quantity: newQty,
        sellingPrice: params.sellingPrice,
        priceSemiGros: params.priceSemiGros,
        priceGros: params.priceGros,
        qtySemiGros: params.qtySemiGros,
        qtyGros: params.qtyGros,
      });

      const updatedLines = lines.map((l) =>
        l.tempId === existing.tempId
          ? {
              ...l,
              quantity: newQty,
              appliedPrice: result.appliedPrice,
              lineTotal: result.lineTotal,
              tierApplied: result.tierApplied,
            }
          : l
      );

      set({ lines: updatedLines });
    } else {
      // Nouvelle ligne
      const result = lineTotal({
        quantity: qty,
        sellingPrice: params.sellingPrice,
        priceSemiGros: params.priceSemiGros,
        priceGros: params.priceGros,
        qtySemiGros: params.qtySemiGros,
        qtyGros: params.qtyGros,
      });

      const newLine: CartLine = {
        tempId: crypto.randomUUID(),
        itemId: params.itemId,
        name: params.name,
        quantity: qty,
        unitPrice: params.sellingPrice,
        appliedPrice: result.appliedPrice,
        discountPercent: null,
        discountAmount: null,
        lineTotal: result.lineTotal,
        tierApplied: result.tierApplied,
        isKit: params.isKit ?? false,
      };

      set({ lines: [...lines, newLine] });
    }

    get().recalc();
  },

  updateQuantity: (tempId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(tempId);
      return;
    }

    const { lines } = get();
    const line = lines.find((l) => l.tempId === tempId);
    if (!line) return;

    const result = lineTotal({
      quantity,
      sellingPrice: line.unitPrice,
      negotiatedPrice: line.appliedPrice !== line.unitPrice ? line.appliedPrice : undefined,
      discountPercent: line.discountPercent,
      discountAmount: line.discountAmount,
    });

    set({
      lines: lines.map((l) =>
        l.tempId === tempId
          ? { ...l, quantity, lineTotal: result.lineTotal, tierApplied: result.tierApplied }
          : l
      ),
    });

    get().recalc();
  },

  updateNegotiatedPrice: (tempId, price) => {
    const { lines } = get();
    set({
      lines: lines.map((l) =>
        l.tempId === tempId
          ? {
              ...l,
              appliedPrice: price,
              lineTotal: Math.round(price * l.quantity),
              tierApplied: null,
            }
          : l
      ),
    });
    get().recalc();
  },

  updateLineDiscount: (tempId, percent, amount) => {
    const { lines } = get();
    const line = lines.find((l) => l.tempId === tempId);
    if (!line) return;

    const result = lineTotal({
      quantity: line.quantity,
      sellingPrice: line.unitPrice,
      negotiatedPrice:
        line.appliedPrice !== line.unitPrice ? line.appliedPrice : undefined,
      discountPercent: percent,
      discountAmount: amount,
    });

    set({
      lines: lines.map((l) =>
        l.tempId === tempId
          ? {
              ...l,
              discountPercent: percent,
              discountAmount: amount,
              lineTotal: result.lineTotal,
            }
          : l
      ),
    });
    get().recalc();
  },

  removeItem: (tempId) => {
    set({ lines: get().lines.filter((l) => l.tempId !== tempId) });
    get().recalc();
  },

  setGlobalDiscount: (percent, amount) => {
    set({
      discountGlobalPercent: percent,
      discountGlobalAmount: amount,
    });
    get().recalc();
  },

  setCustomer: (id, name) => {
    set({ customerId: id, customerName: name });
  },

  clearCart: () => {
    set({
      lines: [],
      discountGlobalPercent: null,
      discountGlobalAmount: null,
      customerId: null,
      customerName: null,
      isSuspended: false,
      subtotal: 0,
      total: 0,
      itemCount: 0,
    });
  },

  recalc: () => {
    const { lines, discountGlobalPercent, discountGlobalAmount } = get();
    const lineTotals = lines.map((l) => l.lineTotal);
    const { subtotal, total } = saleTotal(
      lineTotals,
      discountGlobalPercent,
      discountGlobalAmount
    );
    const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
    set({ subtotal, total, itemCount });
  },

  setSuspended: (suspended) => {
    set({ isSuspended: suspended });
  },

  loadCart: (lines, customerId = null, customerName = null) => {
    set({
      lines,
      customerId,
      customerName,
      isSuspended: false,
    });
    get().recalc();
  },
}));

/**
 * Vérifie le stock pour toutes les lignes du panier.
 */
export function checkCartStock(
  lines: CartLine[],
  stockLevels: Map<UUID, number>
): { itemId: UUID; name: string; requested: number; available: number }[] {
  const shortages: {
    itemId: UUID;
    name: string;
    requested: number;
    available: number;
  }[] = [];

  for (const line of lines) {
    const available = stockLevels.get(line.itemId) ?? 0;
    if (line.quantity > available) {
      shortages.push({
        itemId: line.itemId,
        name: line.name,
        requested: line.quantity,
        available,
      });
    }
  }

  return shortages;
}
