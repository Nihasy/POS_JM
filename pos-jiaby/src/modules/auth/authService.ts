/**
 * Service d'authentification — Logique PIN et permissions.
 *
 * Règles :
 * - Login par PIN (hash argon2/bcrypt)
 * - Verrouillage après 5 échecs pendant 1 min
 * - Permissions OSPOS : Admin (tout), Caissier (vente, encaissement, stock lecture)
 * - Caissier ne voit JAMAIS cost_price ni marges (filtrage au niveau requête)
 */

import type { UUID } from '@/core/domain/types';

export type Role = 'admin' | 'caissier';

export interface AuthUser {
  id: UUID;
  username: string;
  fullName: string;
  role: Role;
}

export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  error?: 'INVALID_PIN' | 'LOCKED' | 'DELETED';
  remainingAttempts?: number;
  lockedUntil?: string;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 60_000; // 1 minute

/**
 * Vérifie si un compte est verrouillé.
 */
export function isLocked(
  failedAttempts: number,
  lockedUntil: string | null
): boolean {
  if (!lockedUntil) return false;
  if (failedAttempts < MAX_FAILED_ATTEMPTS) return false;

  const lockTime = new Date(lockedUntil).getTime();
  const now = Date.now();

  return now < lockTime;
}

/**
 * Calcule le temps de verrouillage restant en secondes.
 */
export function lockRemainingSeconds(lockedUntil: string | null): number {
  if (!lockedUntil) return 0;
  const remaining = new Date(lockedUntil).getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / 1000));
}

/**
 * Applique les règles métier de connexion (verrouillage, soft delete).
 * La comparaison cryptographique du hash est faite en amont (pinHasher) ;
 * son résultat est passé via `pinMatches`.
 */
export function validatePin(
  _inputPin: string,
  _storedHash: string,
  failedAttempts: number,
  lockedUntil: string | null,
  deleted: number,
  pinMatches: boolean = true
): AuthResult {
  // Compte supprimé
  if (deleted === 1) {
    return { success: false, error: 'DELETED' };
  }

  // Vérifier le verrouillage
  if (isLocked(failedAttempts, lockedUntil)) {
    return {
      success: false,
      error: 'LOCKED',
      lockedUntil: lockedUntil!,
    };
  }

  if (!pinMatches) {
    const newAttempts = failedAttempts + 1;
    const lockUntil =
      newAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCK_DURATION_MS).toISOString()
        : null;

    return {
      success: false,
      error: 'INVALID_PIN',
      remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - newAttempts),
      lockedUntil: lockUntil ?? undefined,
    };
  }

  return { success: true };
}

/**
 * Authentifie un utilisateur par PIN contre la base.
 *
 * Le login est « PIN seul » (pas de nom d'utilisateur) : le PIN est
 * comparé au hash de chaque compte actif. Échecs et verrouillage
 * sont persistés sur le compte correspondant… faute de compte
 * identifiable, sur tous les comptes non verrouillés (anti brute-force).
 */
export async function authenticate(
  db: {
    select<T>(sql: string, params?: unknown[]): Promise<T[]>;
    execute(sql: string, params?: unknown[]): Promise<unknown>;
  },
  pin: string
): Promise<AuthResult> {
  const { verifyPin } = await import('./pinHasher');

  const users = await db.select<{
    id: UUID;
    username: string;
    pin_hash: string;
    full_name: string;
    role: Role;
    failed_attempts: number;
    locked_until: string | null;
    deleted: number;
  }>('SELECT * FROM users WHERE deleted = 0');

  for (const user of users) {
    if (isLocked(user.failed_attempts, user.locked_until)) continue;

    const matches = await verifyPin(pin, user.pin_hash);
    if (matches) {
      // Réinitialiser le compteur d'échecs
      await db.execute(
        'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?',
        [user.id]
      );
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role,
        },
      };
    }
  }

  // PIN inconnu : incrémenter les échecs sur tous les comptes actifs
  // et verrouiller ceux qui atteignent le seuil.
  const lockUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
  await db.execute(
    `UPDATE users
     SET failed_attempts = failed_attempts + 1,
         locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END
     WHERE deleted = 0`,
    [MAX_FAILED_ATTEMPTS, lockUntil]
  );

  const maxAttempts = Math.max(0, ...users.map((u) => u.failed_attempts)) + 1;
  return {
    success: false,
    error: maxAttempts >= MAX_FAILED_ATTEMPTS ? 'LOCKED' : 'INVALID_PIN',
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - maxAttempts),
  };
}

/**
 * Liste des modules et permissions (grille OSPOS).
 */
export const PERMISSIONS = {
  // Vente
  'caisse.vendre': 'Effectuer des ventes',
  'caisse.encaisser': 'Encaisser des paiements',
  'caisse.remise': 'Appliquer des remises',
  'caisse.suspendre': 'Suspendre et rappeler des paniers',
  'caisse.devis': 'Créer et convertir des devis',
  'caisse.retour': 'Effectuer des retours',

  // Stock
  'stock.lecture': 'Consulter les stocks',
  'stock.reception': 'Réceptionner des marchandises',
  'stock.ajustement': 'Ajuster les stocks',
  'stock.cout_visible': 'Voir les coûts et marges', // Admin only

  // Catalogue
  'catalogue.lecture': 'Consulter le catalogue',
  'catalogue.edition': 'Créer et modifier des produits',
  'catalogue.suppression': 'Supprimer des produits',

  // Clients
  'clients.lecture': 'Consulter les clients',
  'clients.edition': 'Créer et modifier des clients',
  'clients.credit': 'Accorder du crédit',

  // Rapports
  'rapports.ventes': 'Voir les rapports de ventes',
  'rapports.marges': 'Voir les marges', // Admin only
  'rapports.stock': 'Voir les rapports de stock',

  // Caisse
  'cashup.ouverture': 'Ouvrir une session de caisse',
  'cashup.cloture': 'Clôturer une session de caisse',
  'cashup.depense': 'Enregistrer des dépenses',

  // Admin
  'admin.users': 'Gérer les utilisateurs',
  'admin.config': 'Modifier la configuration',
  'admin.import': 'Importer des données',
} as const;

export type PermissionId = keyof typeof PERMISSIONS;

/**
 * Permissions par rôle.
 */
export const ROLE_PERMISSIONS: Record<Role, PermissionId[]> = {
  admin: Object.keys(PERMISSIONS) as PermissionId[],

  caissier: [
    'caisse.vendre',
    'caisse.encaisser',
    'caisse.remise',
    'caisse.suspendre',
    'caisse.devis',
    'stock.lecture',
    'catalogue.lecture',
    'clients.lecture',
    'clients.edition',
    'cashup.ouverture',
    'cashup.cloture',
    'cashup.depense',
  ],
};

/**
 * Vérifie si un rôle a une permission.
 */
export function hasPermission(role: Role, permissionId: PermissionId): boolean {
  return ROLE_PERMISSIONS[role].includes(permissionId);
}
