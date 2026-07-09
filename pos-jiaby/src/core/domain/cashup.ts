/**
 * Sessions de caisse — Règles métier pures.
 *
 * Port des scénarios S30–S34 du proto Python.
 *
 * Règles :
 * - Ouverture obligatoire avant toute vente
 * - Dépenses en cours de session impactent l'attendu espèces
 * - Clôture : attendu = ouverture + ventes espèces − rendus − dépenses
 * - Écart automatique = compté − attendu
 * - MVola et crédit affichés séparément
 */

import type { UUID, PaymentMethod } from './types';

export interface CashupOpenParams {
  userId: UUID;
  openingAmount: number; // Fonds d'ouverture compté (Ariary)
}

export interface CashupCloseParams {
  openingAmount: number;
  cashSales: number; // Total ventes en espèces
  cashReturns: number; // Total rendus espèces
  expenses: number; // Total dépenses
  countedCash: number; // Espèces comptées dans le tiroir
  mvolaTotal: number; // Total MVola
  creditTotal: number; // Total crédit
  note?: string;
}

export interface CashupCloseResult {
  expectedCash: number;
  countedCash: number;
  difference: number; // Écart (compté − attendu)
  mvolaTotal: number;
  creditTotal: number;
  note: string | null;
}

/**
 * Calcule le montant attendu en caisse à la clôture.
 *
 * Formule OSPOS :
 *   attendu = ouverture + ventes_espèces − rendus_espèces − dépenses
 */
export function calculateExpectedCash(
  openingAmount: number,
  cashSales: number,
  cashReturns: number,
  expenses: number
): number {
  return openingAmount + cashSales - cashReturns - expenses;
}

/**
 * Prépare la clôture d'une session de caisse.
 *
 * @returns Résultat de clôture avec écart
 */
export function prepareCashupClose(params: CashupCloseParams): CashupCloseResult {
  const expectedCash = calculateExpectedCash(
    params.openingAmount,
    params.cashSales,
    params.cashReturns,
    params.expenses
  );

  const difference = params.countedCash - expectedCash;

  return {
    expectedCash,
    countedCash: params.countedCash,
    difference,
    mvolaTotal: params.mvolaTotal,
    creditTotal: params.creditTotal,
    note: params.note ?? null,
  };
}

/**
 * Vérifie si une session est ouverte.
 * Les ventes sont bloquées hors session ouverte.
 */
export function canSell(hasOpenSession: boolean): boolean {
  return hasOpenSession;
}

/**
 * Catégories de dépenses prédéfinies.
 */
export const EXPENSE_CATEGORIES = [
  'transport',
  'repas',
  'fournitures',
  'entretien',
  'communication',
  'divers',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Calcule le total des paiements par méthode.
 */
export function groupPaymentsByMethod(
  payments: { method: PaymentMethod; amount: number }[]
): Record<PaymentMethod, number> {
  const groups: Record<PaymentMethod, number> = {
    ESPECES: 0,
    MVOLA: 0,
    CREDIT: 0,
  };

  for (const p of payments) {
    groups[p.method] += p.amount;
  }

  return groups;
}
