/**
 * Réception de stock — Règles métier pures.
 *
 * Port des scénarios S01–S04 du proto Python.
 *
 * Règles :
 * - Ledger positif (entrée en stock)
 * - PMP pondéré recalculé
 * - Conversion conditionnement → unités
 * - Transaction atomique
 */

import type { UUID } from './types';
import { calculatePmp } from './pmp';

export interface ReceiveLine {
  itemId: UUID;
  quantityPerPack: number | null; // null si pas de conditionnement
  numberOfPacks: number;
  looseUnits: number;
  unitCost: number; // Coût unitaire en Ariary
  currentStock: number;
  currentPmp: number;
}

export interface ReceiveResult {
  ledgerEntries: {
    itemId: UUID;
    quantity: number;
    costPrice: number;
    refType: 'RECEIVING';
  }[];
  newPmps: Map<UUID, number>;
  totalCost: number;
}

/**
 * Prépare une réception de stock.
 *
 * Calcule les quantités, le nouveau PMP, et génère les écritures de ledger.
 *
 * S01–S04 : PMP pondéré après chaque réception.
 */
export function prepareReceive(
  lines: ReceiveLine[],
  _refId: UUID,
  _userId: UUID
): ReceiveResult {
  const ledgerEntries: ReceiveResult['ledgerEntries'] = [];
  const newPmps = new Map<UUID, number>();
  let totalCost = 0;

  for (const line of lines) {
    // Conversion conditionnement → unités
    let totalUnits: number;
    if (line.quantityPerPack && line.quantityPerPack > 0) {
      totalUnits = line.numberOfPacks * line.quantityPerPack + line.looseUnits;
    } else {
      totalUnits = line.numberOfPacks + line.looseUnits;
    }

    if (totalUnits <= 0) {
      throw new Error(
        `Réception: quantité totale nulle ou négative pour l'article ${line.itemId}`
      );
    }

    // Calculer nouveau PMP
    const newPmp = calculatePmp(
      line.currentStock,
      line.currentPmp,
      totalUnits,
      line.unitCost
    );
    newPmps.set(line.itemId, newPmp);

    // Écriture ledger positive
    ledgerEntries.push({
      itemId: line.itemId,
      quantity: totalUnits,
      costPrice: line.unitCost,
      refType: 'RECEIVING' as const,
    });

    totalCost += totalUnits * line.unitCost;
  }

  return { ledgerEntries, newPmps, totalCost };
}

/**
 * Calcule le nombre d'étiquettes à imprimer pour une ligne de réception.
 *
 * S02 : À la validation d'une réception, proposition d'impression de N étiquettes.
 */
export function labelsToPrint(
  totalUnits: number,
  labelsPerUnit: number = 1
): number {
  return Math.ceil(totalUnits * labelsPerUnit);
}
