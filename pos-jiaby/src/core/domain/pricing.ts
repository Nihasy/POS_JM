/**
 * Moteur de prix — Règles métier pures.
 *
 * Port des scénarios S05, S09–S14 du proto Python.
 *
 * Ordre de calcul contractuel :
 *   1. Palier (détail / semi-gros / gros) → prix de palier
 *   2. Prix négocié (override manuel) → si présent, remplace le prix de palier
 *   3. Remise ligne (% ou Ar) → appliquée sur le prix déjà déterminé
 *   4. Remise globale (%) → appliquée sur le total Σ lignes
 *
 * S12 : catalog_price vs applied_price tracés sur chaque ligne.
 */

/**
 * Détermine le palier applicable selon la quantité.
 *
 * @param qty - Quantité commandée
 * @param qtySemiGros - Seuil semi-gros (null si non défini)
 * @param qtyGros - Seuil gros (null si non défini)
 * @returns 'gros' | 'semi-gros' | 'detail'
 *
 * Règle : gros ≥ qty_gros > semi-gros ≥ qty_semi_gros > détail
 */
export function getTier(
  qty: number,
  qtySemiGros: number | null,
  qtyGros: number | null
): 'gros' | 'semi-gros' | 'detail' {
  // Les paliers ne s'appliquent que si les seuils sont définis
  if (qtyGros !== null && qty >= qtyGros) {
    return 'gros';
  }

  if (qtySemiGros !== null && qty >= qtySemiGros) {
    return 'semi-gros';
  }

  return 'detail';
}

/**
 * Calcule le prix unitaire selon le palier.
 *
 * @param qty - Quantité commandée
 * @param sellingPrice - Prix détail
 * @param priceSemiGros - Prix semi-gros
 * @param priceGros - Prix gros
 * @param qtySemiGros - Seuil semi-gros
 * @param qtyGros - Seuil gros
 * @returns Prix unitaire applicable
 */
export function tierPrice(
  qty: number,
  sellingPrice: number,
  priceSemiGros: number | null,
  priceGros: number | null,
  qtySemiGros: number | null,
  qtyGros: number | null
): { price: number; tier: 'gros' | 'semi-gros' | 'detail' } {
  const tier = getTier(qty, qtySemiGros, qtyGros);

  switch (tier) {
    case 'gros':
      return { price: priceGros!, tier: 'gros' };
    case 'semi-gros':
      return { price: priceSemiGros!, tier: 'semi-gros' };
    case 'detail':
      return { price: sellingPrice, tier: 'detail' };
  }
}

/**
 * Applique une remise sur un prix.
 *
 * @param price - Prix de base (Ariary, entier)
 * @param discountPercent - Remise en % (ex: 10 = 10%)
 * @param discountAmount - Remise en Ar (ex: 500 = −500 Ar)
 * @returns Prix après remise
 *
 * Règle : si les deux sont fournis, le % s'applique d'abord, puis le montant fixe.
 */
export function applyDiscount(
  price: number,
  discountPercent: number | null,
  discountAmount: number | null
): number {
  let result = price;

  if (discountPercent !== null && discountPercent > 0) {
    const discount = Math.round((result * discountPercent) / 100);
    result = Math.max(0, result - discount);
  }

  if (discountAmount !== null && discountAmount > 0) {
    result = Math.max(0, result - discountAmount);
  }

  return result;
}

/**
 * Calcule le total d'une ligne de vente.
 *
 * Ordre : palier → prix négocié (override) → remise ligne → total
 *
 * S13 : lineTotal
 */
export function lineTotal(params: {
  quantity: number;
  sellingPrice: number; // Prix détail catalogue
  priceSemiGros?: number | null;
  priceGros?: number | null;
  qtySemiGros?: number | null;
  qtyGros?: number | null;
  negotiatedPrice?: number | null; // Override manuel du prix
  discountPercent?: number | null;
  discountAmount?: number | null;
}): {
  catalogPrice: number;
  appliedPrice: number;
  lineTotal: number;
  tierApplied: 'gros' | 'semi-gros' | 'detail' | null;
} {
  const qtySemiGros = params.qtySemiGros ?? null;
  const qtyGros = params.qtyGros ?? null;
  const priceSemiGros = params.priceSemiGros ?? null;
  const priceGros = params.priceGros ?? null;

  // 1. Prix selon palier
  const tierResult = tierPrice(
    params.quantity,
    params.sellingPrice,
    priceSemiGros,
    priceGros,
    qtySemiGros,
    qtyGros
  );

  // 2. Prix négocié (override)
  let appliedUnitPrice = params.negotiatedPrice ?? tierResult.price;
  const tierApplied = params.negotiatedPrice ? null : tierResult.tier;

  // 3. Remise ligne
  const discountedUnitPrice = applyDiscount(
    appliedUnitPrice,
    params.discountPercent ?? null,
    params.discountAmount ?? null
  );

  // 4. Total ligne = prix remisé × qté
  const total = Math.round(discountedUnitPrice * params.quantity);

  return {
    catalogPrice: params.sellingPrice,
    appliedPrice: appliedUnitPrice,
    lineTotal: total,
    tierApplied,
  };
}

/**
 * Calcule le total de vente avec remise globale.
 *
 * S14 : total avec remise globale
 */
export function saleTotal(
  lineTotals: number[],
  discountGlobalPercent: number | null,
  discountGlobalAmount: number | null
): { subtotal: number; total: number } {
  const subtotal = lineTotals.reduce((sum, lt) => sum + lt, 0);

  // Appliquer d'abord le %, puis le montant
  let total = subtotal;

  if (discountGlobalPercent !== null && discountGlobalPercent > 0) {
    const discount = Math.round((total * discountGlobalPercent) / 100);
    total = Math.max(0, total - discount);
  }

  if (discountGlobalAmount !== null && discountGlobalAmount > 0) {
    total = Math.max(0, total - discountGlobalAmount);
  }

  return { subtotal, total };
}
