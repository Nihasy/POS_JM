/**
 * Service stock — Logique réceptions, ajustements, alertes.
 *
 * Interface entre les modules UI et le domain layer.
 */

import type { UUID } from '@/core/domain/types';
import { prepareReceive, labelsToPrint } from '@/core/domain/receive';
import { prepareAdjustment, prepareManualOut } from '@/core/domain/adjustment';
import type { AdjustmentReason } from '@/core/domain/adjustment';
import { needsReorder } from '@/core/domain/velocity';

export type { AdjustmentReason };

export interface StockAlert {
  itemId: UUID;
  name: string;
  currentStock: number;
  reorderLevel: number;
  deficit: number;
}

/**
 * Prépare une réception de marchandises.
 */
export function processReception(params: {
  lines: {
    itemId: UUID;
    quantityPerPack: number | null;
    numberOfPacks: number;
    looseUnits: number;
    unitCost: number;
    currentStock: number;
    currentPmp: number;
  }[];
  refId: UUID;
  userId: UUID;
}) {
  return prepareReceive(params.lines, params.refId, params.userId);
}

/**
 * Calcule le nombre d'étiquettes à imprimer.
 */
export function getLabelsCount(totalUnits: number, labelsPerUnit?: number): number {
  return labelsToPrint(totalUnits, labelsPerUnit);
}

/**
 * Prépare un ajustement d'inventaire.
 */
export function processAdjustment(params: {
  lines: { itemId: UUID; expectedQty: number; countedQty: number }[];
  reason: AdjustmentReason;
  userId: UUID;
}) {
  return prepareAdjustment(params.lines, params.reason, params.userId);
}

/**
 * Prépare une sortie manuelle.
 */
export function processManualOut(params: {
  itemId: UUID;
  quantity: number;
  reason: AdjustmentReason;
  userId: UUID;
  comment?: string;
}) {
  return prepareManualOut(params);
}

/**
 * Vérifie les alertes de stock pour une liste de produits.
 */
export function checkStockAlerts(
  items: { itemId: UUID; name: string; stock: number; reorderLevel: number | null }[]
): StockAlert[] {
  return items
    .filter((item) => needsReorder(item.stock, item.reorderLevel))
    .map((item) => ({
      itemId: item.itemId,
      name: item.name,
      currentStock: item.stock,
      reorderLevel: item.reorderLevel!,
      deficit: item.reorderLevel! - item.stock,
    }))
    .sort((a, b) => b.deficit - a.deficit);
}
