/**
 * Ajustements de stock — Règles métier pures.
 *
 * Port des scénarios S29 du proto Python.
 *
 * Règles :
 * - Contre-écritures ledger
 * - Validation Admin obligatoire
 * - Motif obligatoire pour les sorties manuelles
 */

import type { UUID } from './types';

export type AdjustmentReason =
  | 'casse'
  | 'don'
  | 'usage_interne'
  | 'peremption'
  | 'vol'
  | 'inventaire'; // écart d'inventaire

export interface AdjustmentLine {
  itemId: UUID;
  expectedQty: number; // Quantité théorique (système)
  countedQty: number; // Quantité comptée
}

export interface AdjustmentResult {
  ledgerEntries: {
    itemId: UUID;
    quantity: number; // Différence (compté − théorique)
    refType: 'ADJUSTMENT';
    comment: string;
  }[];
  summary: {
    itemId: UUID;
    expected: number;
    counted: number;
    difference: number;
  }[];
}

/**
 * Prépare un ajustement de stock (inventaire).
 *
 * S29 : Contre-écritures ADJUSTMENT pour chaque écart.
 *
 * @param lines - Lignes d'ajustement (théorique vs compté)
 * @param reason - Motif de l'ajustement
 * @param userId - Utilisateur effectuant l'ajustement
 */
export function prepareAdjustment(
  lines: AdjustmentLine[],
  reason: AdjustmentReason,
  userId: UUID
): AdjustmentResult {
  const ledgerEntries: AdjustmentResult['ledgerEntries'] = [];
  const summary: AdjustmentResult['summary'] = [];

  for (const line of lines) {
    const difference = line.countedQty - line.expectedQty;

    // Ignorer les lignes sans écart
    if (Math.abs(difference) < 0.001) continue;

    ledgerEntries.push({
      itemId: line.itemId,
      quantity: difference, // Positif si surplus, négatif si manquant
      refType: 'ADJUSTMENT' as const,
      comment: `Ajustement: ${reason} (attendu: ${line.expectedQty}, compté: ${line.countedQty}) — user: ${userId}`,
    });

    summary.push({
      itemId: line.itemId,
      expected: line.expectedQty,
      counted: line.countedQty,
      difference,
    });
  }

  return { ledgerEntries, summary };
}

/**
 * Prépare une sortie manuelle (casse, don, usage interne).
 * Motif obligatoire.
 *
 * @returns Écriture négative dans le ledger
 */
export function prepareManualOut(params: {
  itemId: UUID;
  quantity: number;
  reason: AdjustmentReason;
  userId: UUID;
  comment?: string;
}): {
  ledgerEntry: {
    itemId: UUID;
    quantity: number;
    refType: 'MANUAL_OUT';
    comment: string;
  };
} {
  if (params.quantity <= 0) {
    throw new Error('Sortie manuelle: la quantité doit être positive');
  }

  const comment =
    params.comment ||
    `Sortie manuelle: ${params.reason} — user: ${params.userId}`;

  return {
    ledgerEntry: {
      itemId: params.itemId,
      quantity: -params.quantity, // Négatif = sortie
      refType: 'MANUAL_OUT' as const,
      comment,
    },
  };
}
