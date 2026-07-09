type PastilleVariant = 'sync-ok' | 'hors-ligne' | 'alerte';

interface PastilleProps {
  variant: PastilleVariant;
  label: string;
}

const variantClasses: Record<PastilleVariant, string> = {
  'sync-ok': 'bg-especes',
  'hors-ligne': 'bg-alerte',
  'alerte': 'bg-red-500',
};

/**
 * Pastille d'état (réseau, session) toujours visible dans la barre du haut.
 *
 * @example
 * <Pastille variant="sync-ok" label="Synchronisé" />
 * <Pastille variant="hors-ligne" label="Hors ligne (3 en attente)" />
 */
export function Pastille({ variant, label }: PastilleProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-encre-2">
      <span
        className={`inline-block h-2 w-2 rounded-full ${variantClasses[variant]}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
