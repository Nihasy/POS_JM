/**
 * Finalisation de vente — Règles métier pures.
 *
 * Port des scénarios S15–S28 du proto Python.
 *
 * Règles :
 * - Transaction atomique (tout ou rien)
 * - Contrôle stock (blocage par défaut, option admin allow_negative_stock)
 * - Paiements multiples : ESPECES / MVOLA / CREDIT
 * - Rendu imputé sur espèces uniquement
 * - Trop-perçu non-espèces refusé
 * - Crédit : client obligatoire + contrôle plafond
 * - cost_price FIGÉ au moment de la vente (S07)
 * - Numérotation V-2026-NNNNN (S08)
 */

import type { UUID, PaymentMethod, CartLine, CartPayment } from './types';

export interface FinalizeParams {
  cartLines: CartLine[];
  payments: CartPayment[];
  customerId: UUID | null;
  userId: UUID;
  allowNegativeStock: boolean;
  isQuote: boolean;
  isReturn: boolean;
  originalSaleId?: UUID | null;
}

export interface FinalizeResult {
  sale: {
    id: UUID;
    saleNumber: string;
    customerId: UUID | null;
    userId: UUID;
    status: 'COMPLETED' | 'SUSPENDED';
    subtotal: number;
    discountGlobalPercent: number | null;
    discountGlobalAmount: number | null;
    total: number;
    isQuote: number;
    isReturn: number;
    originalSaleId: UUID | null;
  };
  items: {
    id: UUID;
    saleId: UUID;
    itemId: UUID;
    nameSnapshot: string;
    quantity: number;
    catalogPrice: number;
    appliedPrice: number;
    discountPercent: number | null;
    discountAmount: number | null;
    lineTotal: number;
    costPriceSnapshot: number;
    tierApplied: 'detail' | 'semi-gros' | 'gros' | null;
  }[];
  payments: {
    id: UUID;
    method: PaymentMethod;
    amount: number;
    reference: string | null;
    changeGiven: number | null;
  }[];
  ledgerEntries: {
    itemId: UUID;
    quantity: number;
    costPrice: number | null;
  }[];
  errors: string[];
}

/**
 * Valide et prépare une vente pour finalisation.
 * Ne modifie rien — retourne les données prêtes à être persistées en transaction atomique.
 */
export function prepareFinalize(params: FinalizeParams): FinalizeResult {
  const errors: string[] = [];

  // Validation de base
  if (params.cartLines.length === 0) {
    errors.push('Le panier est vide.');
  }

  // Vérifier le total des paiements
  const total = params.cartLines.reduce((sum, line) => sum + line.lineTotal, 0);

  if (total <= 0 && !params.isQuote) {
    errors.push('Le total de la vente doit être positif.');
  }

  const paymentTotal = params.payments.reduce((sum, p) => sum + p.amount, 0);

  if (!params.isQuote && paymentTotal < total) {
    errors.push(`Paiement insuffisant : ${paymentTotal} Ar sur ${total} Ar.`);
  }

  // Vérifier les paiements
  for (const payment of params.payments) {
    // MVOLA : référence obligatoire (S15)
    if (payment.method === 'MVOLA' && !payment.reference) {
      errors.push('MVola : référence de transaction obligatoire.');
    }

    // CREDIT : client obligatoire (S17)
    if (payment.method === 'CREDIT' && !params.customerId) {
      errors.push('Paiement à crédit : client obligatoire.');
    }

    // Trop-perçu non-espèces refusé (S16)
    if (payment.method !== 'ESPECES' && payment.amount > total) {
      errors.push(
        `Trop-perçu refusé pour ${payment.method}. Seul le paiement en espèces accepte le rendu.`
      );
    }
  }

  // Calculer le rendu (espèces uniquement)
  let changeGiven: number | null = null;
  const cashPayment = params.payments.find((p) => p.method === 'ESPECES');
  if (cashPayment && cashPayment.amount > total) {
    // Vérifier que le trop-perçu espèces peut être rendu
    const overpayment = cashPayment.amount - (total - params.payments
      .filter(p => p.method !== 'ESPECES')
      .reduce((s, p) => s + p.amount, 0));
    if (overpayment > 0) {
      changeGiven = overpayment;
    }
  }

  // Générer les IDs
  const saleId = crypto.randomUUID();

  // Construire les lignes
  const items = params.cartLines.map((line) => ({
    id: crypto.randomUUID(),
    saleId,
    itemId: line.itemId,
    nameSnapshot: line.name,
    quantity: line.quantity,
    catalogPrice: line.unitPrice,
    appliedPrice: line.appliedPrice,
    discountPercent: line.discountPercent,
    discountAmount: line.discountAmount,
    lineTotal: line.lineTotal,
    costPriceSnapshot: 0, // Sera renseigné depuis la DB (PMP au moment de la vente)
    tierApplied: line.tierApplied,
  }));

  // Construire les paiements
  const payments = params.payments.map((p) => ({
    id: crypto.randomUUID(),
    method: p.method,
    amount: p.amount,
    reference: p.reference,
    changeGiven: p.method === 'ESPECES' ? changeGiven : null,
  }));

  // Écritures de ledger (sorties de stock)
  const ledgerEntries = params.cartLines
    .filter((line) => !line.isKit) // Les kits n'ont pas d'écriture directe
    .map((line) => ({
      itemId: line.itemId,
      quantity: -line.quantity, // Sortie = négatif
      costPrice: null, // Sera renseigné depuis la DB
    }));

  // Numéro de vente (sera généré par le repository avec un compteur)
  const saleNumber = params.isQuote ? 'D-2026-XXXXX' : 'V-2026-XXXXX';

  return {
    sale: {
      id: saleId,
      saleNumber,
      customerId: params.customerId,
      userId: params.userId,
      status: params.isQuote ? 'SUSPENDED' : 'COMPLETED',
      subtotal: total,
      discountGlobalPercent: null,
      discountGlobalAmount: null,
      total,
      isQuote: params.isQuote ? 1 : 0,
      isReturn: params.isReturn ? 1 : 0,
      originalSaleId: params.originalSaleId ?? null,
    },
    items,
    payments,
    ledgerEntries,
    errors,
  };
}

/**
 * Vérifie si le stock est suffisant pour toutes les lignes.
 *
 * @param cartLines - Lignes du panier
 * @param stockLevels - Map itemId → stock disponible
 * @returns Liste des articles en rupture
 */
export function checkStock(
  cartLines: CartLine[],
  stockLevels: Map<UUID, number>
): { itemId: UUID; name: string; requested: number; available: number }[] {
  const shortages: {
    itemId: UUID;
    name: string;
    requested: number;
    available: number;
  }[] = [];

  for (const line of cartLines) {
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

/**
 * Vérifie le plafond crédit d'un client.
 *
 * @param currentBalanceDue - Solde actuel du client
 * @param creditLimit - Plafond de crédit
 * @param newCreditAmount - Montant du nouveau crédit
 * @returns true si le crédit est accepté
 */
export function checkCreditLimit(
  currentBalanceDue: number,
  creditLimit: number,
  newCreditAmount: number
): boolean {
  return currentBalanceDue + newCreditAmount <= creditLimit;
}
