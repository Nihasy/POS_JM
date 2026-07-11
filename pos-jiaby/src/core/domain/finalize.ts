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
import { saleTotal } from './pricing';

export interface FinalizeParams {
  cartLines: CartLine[];
  payments: CartPayment[];
  customerId: UUID | null;
  userId: UUID;
  allowNegativeStock: boolean;
  isQuote: boolean;
  isReturn: boolean;
  originalSaleId?: UUID | null;
  /** PMP courant par article — FIGÉ dans la vente au moment de la finalisation (S07) */
  costPrices?: Map<UUID, number>;
  /** Remise globale (S14) — appliquée après les remises ligne */
  discountGlobalPercent?: number | null;
  discountGlobalAmount?: number | null;
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

  // Total : Σ lignes → remise globale (S14, ordre de calcul contractuel)
  const { subtotal, total } = saleTotal(
    params.cartLines.map((l) => l.lineTotal),
    params.discountGlobalPercent ?? null,
    params.discountGlobalAmount ?? null
  );

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

  // Calculer le rendu (espèces uniquement) — S15
  // Règle : si le total payé dépasse le total dû, le trop-perçu est rendu
  // sur le paiement en espèces. Le trop-perçu non-espèces est refusé (S16).
  let changeGiven: number | null = null;
  const overpayment = paymentTotal - total;
  if (overpayment > 0) {
    // Vérifier que le trop-perçu est couvert par les espèces
    const cashPayment = params.payments.find((p) => p.method === 'ESPECES');
    if (!cashPayment || cashPayment.amount < overpayment) {
      errors.push('Rendu impossible: trop-perçu non-espèces');
    } else {
      changeGiven = overpayment;
    }
  }

  // Générer les IDs
  const saleId = crypto.randomUUID();

  // Construire les lignes — cost_price FIGÉ au moment de la vente (S07)
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
    costPriceSnapshot: params.costPrices?.get(line.itemId) ?? 0,
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

  // Écritures de ledger : sortie (négatif) pour une vente,
  // retour en stock (positif) pour un retour (S26–S27).
  // Un devis ne génère AUCUN mouvement de stock (S23).
  const ledgerEntries = params.isQuote
    ? []
    : params.cartLines
        .filter((line) => !line.isKit) // Les kits sont décomposés en composants par la couche service
        .map((line) => ({
          itemId: line.itemId,
          quantity: params.isReturn ? line.quantity : -line.quantity,
          costPrice: params.costPrices?.get(line.itemId) ?? null,
        }));

  // Numéro de vente (sera généré par le repository avec un compteur)
  const prefix = params.isReturn ? 'R' : params.isQuote ? 'D' : 'V';
  const saleNumber = `${prefix}-2026-XXXXX`;

  return {
    sale: {
      id: saleId,
      saleNumber,
      customerId: params.customerId,
      userId: params.userId,
      status: params.isQuote ? 'SUSPENDED' : 'COMPLETED',
      subtotal,
      discountGlobalPercent: params.discountGlobalPercent ?? null,
      discountGlobalAmount: params.discountGlobalAmount ?? null,
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
 * Prépare la suspension d'un panier (S21–S22).
 * Statut SUSPENDED, AUCUN mouvement de stock, aucun paiement.
 */
export function prepareSuspend(
  cartLines: CartLine[],
  customerId: UUID | null,
  userId: UUID,
  discountGlobalPercent: number | null = null,
  discountGlobalAmount: number | null = null
): {
  sale: {
    id: UUID;
    customerId: UUID | null;
    userId: UUID;
    status: 'SUSPENDED';
    subtotal: number;
    discountGlobalPercent: number | null;
    discountGlobalAmount: number | null;
    total: number;
  };
  items: FinalizeResult['items'];
  ledgerEntries: [];
  errors: string[];
} {
  const errors: string[] = [];
  if (cartLines.length === 0) {
    errors.push('Impossible de suspendre un panier vide.');
  }

  // La remise globale fait partie du panier suspendu (S21) :
  // elle doit être conservée et restaurée au rappel.
  const { subtotal, total } = saleTotal(
    cartLines.map((l) => l.lineTotal),
    discountGlobalPercent,
    discountGlobalAmount
  );
  const saleId = crypto.randomUUID();

  return {
    sale: {
      id: saleId,
      customerId,
      userId,
      status: 'SUSPENDED',
      subtotal,
      discountGlobalPercent,
      discountGlobalAmount,
      total,
    },
    items: cartLines.map((line) => ({
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
      costPriceSnapshot: 0,
      tierApplied: line.tierApplied,
    })),
    ledgerEntries: [],
    errors,
  };
}

/**
 * Vérifie le stock des composants d'un kit (S24).
 * Le kit est refusé si un composant manque.
 *
 * @param components - Composition du kit (composant + qté nécessaire par kit)
 * @param kitQuantity - Nombre de kits demandés
 * @param stockLevels - Map itemId → stock disponible
 * @returns Liste des composants manquants (vide = kit vendable)
 */
export function checkKitStock(
  components: { itemId: UUID; name: string; quantity: number }[],
  kitQuantity: number,
  stockLevels: Map<UUID, number>
): { itemId: UUID; name: string; requested: number; available: number }[] {
  const shortages: { itemId: UUID; name: string; requested: number; available: number }[] = [];

  for (const comp of components) {
    const needed = comp.quantity * kitQuantity;
    const available = stockLevels.get(comp.itemId) ?? 0;
    if (needed > available) {
      shortages.push({
        itemId: comp.itemId,
        name: comp.name,
        requested: needed,
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

/**
 * Calcule le nouveau solde après règlement crédit (S19).
 *
 * @param currentBalanceDue - Solde actuel du client
 * @param amount - Montant du règlement
 * @returns Nouveau solde (≥ 0)
 */
export function settleCredit(
  currentBalanceDue: number,
  amount: number
): number {
  return Math.max(0, currentBalanceDue - amount);
}

/**
 * Vérifie la permission admin pour un retour (S26).
 *
 * @param adminPin - true si le PIN admin a été validé
 * @throws Error si le PIN admin n'est pas fourni
 */
export function checkReturnPermission(adminPin: boolean): void {
  if (!adminPin) {
    throw new Error('Retour: PIN admin requis');
  }
}
