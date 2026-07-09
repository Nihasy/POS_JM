/**
 * Hook usePermission — Vérification de permissions dans les composants React.
 *
 * Utilise le store Zustand auth pour obtenir le rôle courant.
 * Masquage systématique des coûts pour Caissier (au niveau requête, pas seulement UI).
 */

import type { ReactNode } from 'react';
import { useAuthStore } from './authStore';
import { hasPermission, type PermissionId } from './authService';
import type { Role } from './authService';

/**
 * Vérifie si l'utilisateur courant a une permission donnée.
 *
 * @example
 * const { can } = usePermission();
 * if (can('caisse.vendre')) { ... }
 * if (can('stock.cout_visible')) { ... } // false pour Caissier
 */
export function usePermission() {
  const user = useAuthStore((s) => s.user);
  const role: Role | null = user?.role ?? null;

  return {
    /** Vérifie une permission unique */
    can: (permissionId: PermissionId): boolean => {
      if (!role) return false;
      return hasPermission(role, permissionId);
    },

    /** Vérifie que toutes les permissions sont accordées */
    canAll: (...permissionIds: PermissionId[]): boolean => {
      if (!role) return false;
      return permissionIds.every((id) => hasPermission(role, id));
    },

    /** Vérifie qu'au moins une permission est accordée */
    canAny: (...permissionIds: PermissionId[]): boolean => {
      if (!role) return false;
      return permissionIds.some((id) => hasPermission(role, id));
    },

    /** Rôle courant */
    role,

    /** true si Admin */
    isAdmin: role === 'admin',

    /** true si Caissier (masquer les coûts) */
    isCaissier: role === 'caissier',
  };
}

/**
 * Composant wrapper qui masque son contenu si la permission est refusée.
 *
 * @example
 * <IfPermission permission="stock.cout_visible">
 *   <PrixCoutant value={item.cost_price} />
 * </IfPermission>
 */
interface IfPermissionProps {
  permission: PermissionId;
  children: ReactNode;
  fallback?: ReactNode;
}

export function IfPermission({ permission, children, fallback = null }: IfPermissionProps) {
  const { can } = usePermission();
  return can(permission) ? <>{children}</> : <>{fallback}</>;
}
