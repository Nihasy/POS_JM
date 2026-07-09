/**
 * Vélocité des ventes — Règles métier pures.
 *
 * Port des scénarios S31 du proto Python.
 *
 * Calcule :
 * - Ventes/jour par produit sur 30 et 90 jours
 * - Jours de stock restants
 * - Tri par "à commander en premier"
 */

import type { UUID } from './types';

export interface VelocityInput {
  itemId: UUID;
  itemName: string;
  currentStock: number;
  totalSold30d: number; // Unités vendues en 30 jours
  totalSold90d: number; // Unités vendues en 90 jours
}

export interface VelocityResult {
  itemId: UUID;
  itemName: string;
  currentStock: number;
  salesPerDay30d: number;
  salesPerDay90d: number;
  daysOfStock30d: number | null; // null si ventes nulles (stock "infini")
  daysOfStock90d: number | null;
}

/**
 * Calcule la vélocité pour une liste de produits.
 *
 * S31 : ventes/jour et jours de stock restants.
 *
 * @returns Liste triée par urgence (jours de stock les plus bas en premier)
 */
export function calculateVelocity(items: VelocityInput[]): VelocityResult[] {
  const results: VelocityResult[] = items.map((item) => {
    const salesPerDay30d = item.totalSold30d / 30;
    const salesPerDay90d = item.totalSold90d / 90;

    const daysOfStock30d =
      salesPerDay30d > 0 ? item.currentStock / salesPerDay30d : null;
    const daysOfStock90d =
      salesPerDay90d > 0 ? item.currentStock / salesPerDay90d : null;

    return {
      itemId: item.itemId,
      itemName: item.itemName,
      currentStock: item.currentStock,
      salesPerDay30d: Math.round(salesPerDay30d * 10) / 10,
      salesPerDay90d: Math.round(salesPerDay90d * 10) / 10,
      daysOfStock30d: daysOfStock30d !== null ? Math.round(daysOfStock30d * 10) / 10 : null,
      daysOfStock90d: daysOfStock90d !== null ? Math.round(daysOfStock90d * 10) / 10 : null,
    };
  });

  // Trier par urgence : jours de stock 30j (null = infini = fin de liste)
  results.sort((a, b) => {
    if (a.daysOfStock30d === null && b.daysOfStock30d === null) return 0;
    if (a.daysOfStock30d === null) return 1;
    if (b.daysOfStock30d === null) return -1;
    return a.daysOfStock30d - b.daysOfStock30d;
  });

  return results;
}

/**
 * Détermine si un produit doit être réapprovisionné.
 *
 * S33 : Alerte si stock ≤ reorder_level.
 */
export function needsReorder(
  currentStock: number,
  reorderLevel: number | null
): boolean {
  if (reorderLevel === null) return false;
  return currentStock <= reorderLevel;
}

/**
 * Filtre les produits à réapprovisionner.
 */
export function getItemsToReorder(
  items: { itemId: UUID; name: string; stock: number; reorderLevel: number | null }[]
): { itemId: UUID; name: string; stock: number; reorderLevel: number; deficit: number }[] {
  return items
    .filter(
      (item) =>
        item.reorderLevel !== null && item.stock <= item.reorderLevel
    )
    .map((item) => ({
      itemId: item.itemId,
      name: item.name,
      stock: item.stock,
      reorderLevel: item.reorderLevel!,
      deficit: item.reorderLevel! - item.stock,
    }))
    .sort((a, b) => b.deficit - a.deficit); // Plus grand déficit en premier
}
