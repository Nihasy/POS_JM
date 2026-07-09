/**
 * Formatage des quantités.
 *
 * Règle : quantités en REAL (vente au mètre possible).
 * Arrondi d'affichage à 0,1 (une décimale).
 */

/**
 * Formate une quantité pour affichage.
 * Arrondit à 1 décimale, supprime le ",0" si la quantité est entière.
 *
 * @param qty - Quantité (nombre réel)
 * @returns Chaîne formatée
 *
 * @example
 * formatQty(3)       // → "3"
 * formatQty(2.5)     // → "2,5"
 * formatQty(1.234)   // → "1,2"
 * formatQty(0)       // → "0"
 */
export function formatQty(qty: number): string {
  const rounded = Math.round(qty * 10) / 10;

  // Vérifier si c'est un entier après arrondi
  if (rounded === Math.floor(rounded)) {
    return rounded.toString();
  }

  // Formater avec une décimale, virgule comme séparateur décimal (français)
  return rounded.toFixed(1).replace('.', ',');
}

/**
 * Parse une quantité depuis une chaîne.
 * Accepte les formats : "3", "2,5", "2.5", "1,234"
 *
 * @param input - Chaîne à parser
 * @returns Quantité (nombre réel)
 * @throws si le format est invalide
 */
export function parseQty(input: string): number {
  const cleaned = input.replace(',', '.').trim();
  const value = Number(cleaned);

  if (Number.isNaN(value) || value < 0) {
    throw new Error(
      `parseQty: impossible de parser "${input}" en quantité valide`
    );
  }

  return value;
}

/**
 * Formate une quantité avec son unité.
 *
 * @example
 * formatQtyWithUnit(3, "pièce")    // → "3 pièces"
 * formatQtyWithUnit(2.5, "m")      // → "2,5 m"
 * formatQtyWithUnit(1, "pièce")    // → "1 pièce"
 */
export function formatQtyWithUnit(qty: number, unitName: string): string {
  const formatted = formatQty(qty);
  const plural = qty > 1 && unitName !== 'm' ? 's' : '';
  return `${formatted} ${unitName}${plural}`;
}
