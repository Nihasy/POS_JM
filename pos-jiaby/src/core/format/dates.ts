/**
 * Formatage des dates en français.
 *
 * Formats utilisés :
 * - Dates courtes : "09/07/2026"
 * - Dates longues : "09 juillet 2026"
 * - DateTimes : "09/07/2026 14:30"
 * - Heures : "14:30"
 */

/**
 * Formate une date au format court français.
 *
 * @example
 * formatDate(new Date("2026-07-09")) // → "09/07/2026"
 */
export function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Formate une date au format long français.
 *
 * @example
 * formatDateLong(new Date("2026-07-09")) // → "09 juillet 2026"
 */
export function formatDateLong(date: Date): string {
  const mois = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ];
  const d = String(date.getDate()).padStart(2, '0');
  const m = mois[date.getMonth()]!;
  const y = date.getFullYear();
  return `${d} ${m} ${y}`;
}

/**
 * Formate une date avec heure.
 *
 * @example
 * formatDateTime(new Date("2026-07-09T14:30:00")) // → "09/07/2026 14:30"
 */
export function formatDateTime(date: Date): string {
  const datePart = formatDate(date);
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${datePart} ${h}:${min}`;
}

/**
 * Formate une heure seule.
 *
 * @example
 * formatTime(new Date("2026-07-09T14:30:00")) // → "14:30"
 */
export function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

/**
 * Retourne la date du jour à minuit (début de journée).
 */
export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Retourne la date d'il y a N jours à minuit.
 */
export function daysAgo(n: number): Date {
  const d = today();
  d.setDate(d.getDate() - n);
  return d;
}
