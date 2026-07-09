/**
 * Formatage des montants en Ariary.
 *
 * Règle : tous les montants sont en INTEGER (pas de décimales monétaires).
 * Affichage : "12 500 Ar" (séparateur espace insécable fine, suffixe Ar).
 *
 * La devise malgache n'a pas de sous-unité (1 Ar = 1 unité entière).
 */

const NBSP = ' '; // espace insécable
const THIN_NBSP = ' '; // espace insécable fine (recommandé pour les milliers)

/**
 * Formate un montant entier en Ariary pour affichage.
 *
 * @param amount - Montant en Ariary (entier)
 * @returns Chaîne formatée, ex: "1 250 000 Ar"
 *
 * @example
 * formatAriary(1250000) // → "1 250 000 Ar"
 * formatAriary(0)       // → "0 Ar"
 * formatAriary(-500)    // → "−500 Ar"
 */
export function formatAriary(amount: number): string {
  if (!Number.isInteger(amount)) {
    throw new Error(`formatAriary: le montant doit être un entier, reçu ${amount}`);
  }

  const absValue = Math.abs(amount);
  const sign = amount < 0 ? '−' : ''; // signe moins mathématique (−)

  // Groupement par milliers avec espace insécable fine
  const grouped = absValue
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, THIN_NBSP);

  return `${sign}${grouped}${NBSP}Ar`;
}

/**
 * Parse une chaîne Ariary vers un entier.
 * Accepte les formats : "12 500 Ar", "12500", "12 500", "12500Ar"
 *
 * @param input - Chaîne à parser
 * @returns Montant entier en Ariary
 * @throws si le format est invalide
 *
 * @example
 * parseAriary("1 250 000 Ar") // → 1250000
 * parseAriary("12500")         // → 12500
 */
export function parseAriary(input: string): number {
  const cleaned = input
    .replace(/Ar/gi, '')
    .replace(/[\s  ]+/g, '')
    .trim();

  const value = Number(cleaned);

  if (!Number.isInteger(value) || Number.isNaN(value)) {
    throw new Error(
      `parseAriary: impossible de parser "${input}" en montant Ariary valide`
    );
  }

  return value;
}

/**
 * Formate un montant pour les colonnes alignées (sans suffixe Ar).
 * Utilisé dans les tableaux de rapports où le suffixe est dans l'en-tête.
 *
 * @example
 * formatAriaryCol(1250000) // → "1 250 000"
 */
export function formatAriaryCol(amount: number): string {
  if (!Number.isInteger(amount)) {
    throw new Error(`formatAriaryCol: le montant doit être un entier, reçu ${amount}`);
  }

  const absValue = Math.abs(amount);
  const sign = amount < 0 ? '−' : '';

  const grouped = absValue
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, THIN_NBSP);

  return `${sign}${grouped}`;
}
