/**
 * Numérotation des documents — Règles métier pures.
 *
 * Formats :
 * - Ventes : V-2026-NNNNN (S08)
 * - Devis : D-2026-NNNNN
 * - Retours : R-2026-NNNNN
 * - Réceptions : REC-2026-NNNNN
 * - Articles : JIA-XXXX-NNNN (catégorie-séquence)
 */

/**
 * Génère un numéro de vente.
 *
 * @param year - Année (ex: 2026)
 * @param sequence - Numéro de séquence (5 chiffres, zero-padded)
 * @returns "V-2026-00001"
 */
export function saleNumber(year: number, sequence: number): string {
  return `V-${year}-${String(sequence).padStart(5, '0')}`;
}

/**
 * Génère un numéro de devis.
 */
export function quoteNumber(year: number, sequence: number): string {
  return `D-${year}-${String(sequence).padStart(5, '0')}`;
}

/**
 * Génère un numéro de retour/avoir.
 */
export function returnNumber(year: number, sequence: number): string {
  return `R-${year}-${String(sequence).padStart(5, '0')}`;
}

/**
 * Génère un numéro de réception.
 */
export function receivingNumber(year: number, sequence: number): string {
  return `REC-${year}-${String(sequence).padStart(5, '0')}`;
}

/**
 * Génère un numéro d'article (item_number).
 *
 * Format : JIA-XXXX-NNNN
 * Où XXXX est un code catégorie (4 lettres max) et NNNN une séquence.
 *
 * @param categoryCode - Code catégorie (ex: "CABL", "TORC", "SOLA", "AUDI", "ELEC", "ACCE")
 * @param sequence - Numéro de séquence
 * @returns "JIA-CABL-0042"
 */
export function itemNumber(
  categoryCode: string | null,
  sequence: number
): string {
  const code = (categoryCode || 'DIV').toUpperCase().slice(0, 4).padEnd(4, 'X');
  return `JIA-${code}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Code 4 lettres depuis un libellé : accents retirés, lettres seules,
 * majuscules, complété par X. Sert aux références produit.
 */
export function labelCode(label: string | null | undefined, fallback = 'GENE'): string {
  const cleaned = (label ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
  if (!cleaned) return fallback;
  return cleaned.slice(0, 4).padEnd(4, 'X');
}

/**
 * Référence article suggérée : catégorie + nom court + séquence.
 *
 * @example
 * buildItemReference('Torches', 'Lampe frontale', 12) // → "TORC-LAMP-012"
 * buildItemReference(null, 'Visseuse', 3)             // → "GENE-VISS-003"
 */
export function buildItemReference(
  categoryName: string | null | undefined,
  shortName: string,
  sequence: number
): string {
  return `${labelCode(categoryName)}-${labelCode(shortName, 'PROD')}-${String(
    sequence
  ).padStart(3, '0')}`;
}

/**
 * Codes catégorie pour la génération des numéros d'article.
 */
export const CATEGORY_CODES: Record<string, string> = {
  'câbles et cordons': 'CABL',
  'torches': 'TORC',
  'solaire': 'SOLA',
  'audio': 'AUDI',
  'électricité': 'ELEC',
  'electricite': 'ELEC',
  'accessoires': 'ACCE',
};
