import { formatAriary, formatAriaryCol } from '@/core/format';

interface MontantArProps {
  /** Montant en Ariary (entier) */
  value: number;
  /** Mode colonne (sans suffixe Ar, pour tableaux) */
  col?: boolean;
  /** Taille "total" (38px) */
  total?: boolean;
  className?: string;
}

/**
 * Composant d'affichage de montant en Ariary.
 * Utilise la police monospace avec chiffres tabulaires pour un alignement parfait.
 *
 * @example
 * <MontantAr value={1250000} />
 * <MontantAr value={1250000} total />
 * <MontantAr value={1250000} col />
 */
export function MontantAr({ value, col = false, total = false, className = '' }: MontantArProps) {
  const formatted = col ? formatAriaryCol(value) : formatAriary(value);

  const classes = [
    'montant',
    total && 'total-vente',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} aria-label={`${value} Ariary`}>
      {formatted}
    </span>
  );
}
