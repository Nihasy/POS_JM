import type { ReactNode } from 'react';

type BadgeVariant = 'semi-gros' | 'gros' | 'alerte' | 'succès' | 'neutre';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  'semi-gros': 'bg-blue-100 text-neutre',
  'gros': 'bg-green-100 text-especes',
  'alerte': 'bg-amber-100 text-alerte',
  'succès': 'bg-green-100 text-especes',
  'neutre': 'bg-gray-100 text-encre-2',
};

/**
 * Badge pour les paliers de prix sur les lignes du ticket.
 *
 * @example
 * <Badge variant="semi-gros">Semi-gros</Badge>
 * <Badge variant="gros">Gros</Badge>
 */
export function Badge({ children, variant = 'neutre' }: BadgeProps) {
  return (
    <span className={`badge-palier ${variantClasses[variant]}`}>
      {children}
    </span>
  );
}

/**
 * Badge de palier appliqué sur une ligne du ticket.
 */
export function TierBadge({ tier }: { tier: 'semi-gros' | 'gros' }) {
  const label = tier === 'gros' ? 'Gros' : 'Semi-gros';
  return <Badge variant={tier}>{label}</Badge>;
}
