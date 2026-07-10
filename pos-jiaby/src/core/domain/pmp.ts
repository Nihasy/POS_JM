/**
 * PMP (Prix Moyen Pondéré) — Règles métier pures.
 *
 * Port des scénarios S01–S04 du proto Python.
 *
 * Formule PMP (arrondi) :
 *   nouveau_PMP = round((stock_actuel × PMP_actuel + qté_reçue × coût_unitaire) / (stock_actuel + qté_reçue))
 *
 * Arrondi à l'entier le plus proche (Ariary).
 */

/**
 * Calcule le nouveau PMP après une réception.
 *
 * @param currentStock - Stock actuel (quantité)
 * @param currentPmp - PMP actuel (Ariary, entier)
 * @param receivedQty - Quantité reçue
 * @param unitCost - Coût unitaire de la réception (Ariary, entier)
 * @returns Nouveau PMP (Ariary, entier arrondi)
 *
 * @example
 * // S01: Premier achat — stock=0, PMP=0, reçu 10 unités à 5000 Ar
 * calculatePmp(0, 0, 10, 5000) // → 5000
 *
 * // S02: Deuxième achat — stock=10, PMP=5000, reçu 5 unités à 6000 Ar
 * // (10×5000 + 5×6000) / (10+5) = 80000/15 = 5333.33 → 5333
 * calculatePmp(10, 5000, 5, 6000) // → 5333
 */
export function calculatePmp(
  currentStock: number,
  currentPmp: number,
  receivedQty: number,
  unitCost: number
): number {
  if (receivedQty <= 0) {
    throw new Error('calculatePmp: la quantité reçue doit être positive');
  }

  if (unitCost < 0) {
    throw new Error('calculatePmp: le coût unitaire ne peut pas être négatif');
  }

  // Premier achat : le PMP = coût unitaire
  if (currentStock <= 0) {
    return Math.round(unitCost);
  }

  const totalValue = currentStock * currentPmp + receivedQty * unitCost;
  const totalQty = currentStock + receivedQty;

  return Math.round(totalValue / totalQty);
}

/**
 * Calcule la valorisation du stock (Σ qté × PMP).
 *
 * @param items - Articles avec leur quantité et PMP
 * @returns Valeur totale du stock en Ariary
 */
export function calculateStockValue(
  items: { quantity: number; costPrice: number }[]
): number {
  return items.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);
}

/**
 * Calcule le coût de vente (COGS) pour une transaction.
 * Utilise le PMP au moment de la vente (coût figé).
 *
 * @param quantity - Quantité vendue
 * @param costPrice - PMP au moment de la vente
 * @returns Coût total en Ariary
 */
export function calculateCogs(quantity: number, costPrice: number): number {
  return Math.round(quantity * costPrice);
}

/**
 * Calcule la marge brute sur une vente.
 *
 * @param salePrice - Prix de vente total
 * @param cogs - Coût des marchandises vendues
 * @returns Marge en Ariary
 */
export function calculateMargin(salePrice: number, cogs: number): number {
  return salePrice - cogs;
}

/**
 * Calcule le CA et la marge à partir des lignes de vente (S30).
 *
 * Équivalent TypeScript de report_sales_summary() du proto Python.
 *
 * @param items - Lignes avec prix appliqué, qté, et coût unitaire
 * @returns {ca, marge} en Ariary
 */
export function reportSalesSummary(
  items: { appliedPrice: number; quantity: number; costPrice: number }[]
): { ca: number; marge: number } {
  let ca = 0;
  let cost = 0;
  for (const item of items) {
    ca += item.appliedPrice * item.quantity;
    cost += item.costPrice * item.quantity;
  }
  return { ca, marge: ca - cost };
}

/**
 * Calcule la valorisation totale du stock (Σ qté × PMP) (S32).
 *
 * Équivalent TypeScript de report_valuation() du proto Python.
 *
 * @param items - Articles avec leur quantité en stock et PMP
 * @returns Valeur totale du stock en Ariary
 */
export function reportValuation(
  items: { quantity: number; costPrice: number }[]
): number {
  return calculateStockValue(items);
}
