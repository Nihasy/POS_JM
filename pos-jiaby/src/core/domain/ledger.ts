/**
 * Ledger / Stock — Règles métier pures.
 *
 * Port direct du proto Python (docs/pos_proto.py).
 *
 * Règles :
 * - Le stock n'est JAMAIS un champ édité.
 * - Toujours = Σ inventory.trans_inventory (ledger).
 * - item_quantities n'est qu'un cache recalculable.
 * - Soft delete avec contre-écritures si nécessaire.
 */

import type { UUID, InventoryRefType } from './types';

/**
 * Calcule la quantité en stock d'un article à partir du ledger.
 *
 * Équivalent Python : quantity(itemId) = sum(t.quantity for t in inventory where t.item_id == itemId)
 */
export function computeQuantity(transactions: { quantity: number }[]): number {
  return transactions.reduce((sum, t) => sum + t.quantity, 0);
}

/**
 * Crée une écriture de ledger (immutable).
 * Retourne l'objet transaction à insérer.
 *
 * Équivalent Python : postLedger(itemId, qty, refType, refId, user, comment)
 */
export function createLedgerEntry(params: {
  id: UUID;
  itemId: UUID;
  quantity: number;
  costPrice: number | null;
  refType: InventoryRefType;
  refId: UUID;
  userId: UUID;
  comment?: string | null;
}) {
  return {
    id: params.id,
    item_id: params.itemId,
    quantity: params.quantity,
    cost_price: params.costPrice,
    ref_type: params.refType,
    ref_id: params.refId,
    user_id: params.userId,
    comment: params.comment ?? null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Contre-écritures pour annulation/soft-delete.
 * Inverse les quantités pour annuler les mouvements de stock.
 *
 * @param originalTransactions - Les transactions à contre-passer
 * @param newRefType - Le type de référence pour les contre-écritures
 * @param newRefId - L'ID de référence pour les contre-écritures
 * @param userId - L'utilisateur effectuant l'annulation
 */
export function createReversalEntries(
  originalTransactions: {
    id: UUID;
    item_id: UUID;
    quantity: number;
    cost_price: number | null;
  }[],
  newRefType: InventoryRefType,
  newRefId: UUID,
  userId: UUID
) {
  return originalTransactions.map((t) =>
    createLedgerEntry({
      id: crypto.randomUUID(),
      itemId: t.item_id,
      quantity: -t.quantity, // Inverser la quantité
      costPrice: t.cost_price,
      refType: newRefType,
      refId: newRefId,
      userId,
      comment: `Contre-écriture de ${t.id}`,
    })
  );
}

/**
 * Vérifie l'intégrité du ledger.
 * S36 : Σ inventory = item_quantities pour chaque article.
 *
 * Retourne les écarts détectés.
 */
export function verifyLedgerIntegrity(
  inventoryByItem: Map<UUID, number>, // item_id → Σ quantity
  itemQuantities: Map<UUID, number> // item_id → cached quantity
): { itemId: UUID; ledgerSum: number; cachedQty: number; diff: number }[] {
  const allItemIds = new Set([
    ...inventoryByItem.keys(),
    ...itemQuantities.keys(),
  ]);

  const discrepancies: {
    itemId: UUID;
    ledgerSum: number;
    cachedQty: number;
    diff: number;
  }[] = [];

  for (const itemId of allItemIds) {
    const ledgerSum = inventoryByItem.get(itemId) ?? 0;
    const cachedQty = itemQuantities.get(itemId) ?? 0;
    const diff = ledgerSum - cachedQty;

    if (Math.abs(diff) > 0.001) {
      discrepancies.push({ itemId, ledgerSum, cachedQty, diff });
    }
  }

  return discrepancies;
}

/**
 * Recalcule le cache item_quantities à partir du ledger.
 * À exécuter après chaque écriture de stock.
 */
export function recalculateQuantities(
  inventory: { item_id: UUID; quantity: number }[]
): Map<UUID, number> {
  const quantities = new Map<UUID, number>();

  for (const t of inventory) {
    const current = quantities.get(t.item_id) ?? 0;
    quantities.set(t.item_id, current + t.quantity);
  }

  return quantities;
}
