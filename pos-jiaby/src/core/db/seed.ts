/**
 * Données initiales (seed) — Permissions, utilisateurs, catégories.
 *
 * Exécuté au premier démarrage (quand la table users est vide).
 * Les PIN sont hashés avec PBKDF2 (Web Crypto) — à remplacer par bcrypt
 * dès que le backend Rust est disponible.
 *
 * PIN par défaut :
 *   Admin    : 1234
 *   Caissier : 1234
 *
 * ⚠ À CHANGER au premier login en production !
 */

import type { UUID } from '@/core/domain/types';
import type { Db } from './index';
import { withTransaction } from './index';
import { hashPin } from '@/modules/auth/pinHasher';

/** PIN par défaut des comptes seed — à changer au premier login. */
export const DEFAULT_PIN = '1234';

// ─── Permissions OSPOS ─────────────────────────────────────────────

export const SEED_PERMISSIONS: { id: UUID; module_id: string; description: string }[] = [
  { id: 'a0000001-0001-4000-8000-000000000001', module_id: 'caisse.vendre', description: 'Effectuer des ventes' },
  { id: 'a0000001-0001-4000-8000-000000000002', module_id: 'caisse.encaisser', description: 'Encaisser des paiements' },
  { id: 'a0000001-0001-4000-8000-000000000003', module_id: 'caisse.remise', description: 'Appliquer des remises' },
  { id: 'a0000001-0001-4000-8000-000000000004', module_id: 'caisse.suspendre', description: 'Suspendre et rappeler des paniers' },
  { id: 'a0000001-0001-4000-8000-000000000005', module_id: 'caisse.devis', description: 'Creer et convertir des devis' },
  { id: 'a0000001-0001-4000-8000-000000000006', module_id: 'caisse.retour', description: 'Effectuer des retours' },

  { id: 'a0000001-0002-4000-8000-000000000001', module_id: 'stock.lecture', description: 'Consulter les stocks' },
  { id: 'a0000001-0002-4000-8000-000000000002', module_id: 'stock.reception', description: 'Receptionner des marchandises' },
  { id: 'a0000001-0002-4000-8000-000000000003', module_id: 'stock.ajustement', description: 'Ajuster les stocks' },
  { id: 'a0000001-0002-4000-8000-000000000004', module_id: 'stock.cout_visible', description: 'Voir les couts et marges' },

  { id: 'a0000001-0003-4000-8000-000000000001', module_id: 'catalogue.lecture', description: 'Consulter le catalogue' },
  { id: 'a0000001-0003-4000-8000-000000000002', module_id: 'catalogue.edition', description: 'Creer et modifier des produits' },
  { id: 'a0000001-0003-4000-8000-000000000003', module_id: 'catalogue.suppression', description: 'Supprimer des produits' },

  { id: 'a0000001-0004-4000-8000-000000000001', module_id: 'clients.lecture', description: 'Consulter les clients' },
  { id: 'a0000001-0004-4000-8000-000000000002', module_id: 'clients.edition', description: 'Creer et modifier des clients' },
  { id: 'a0000001-0004-4000-8000-000000000003', module_id: 'clients.credit', description: 'Accorder du credit' },

  { id: 'a0000001-0005-4000-8000-000000000001', module_id: 'rapports.ventes', description: 'Voir les rapports de ventes' },
  { id: 'a0000001-0005-4000-8000-000000000002', module_id: 'rapports.marges', description: 'Voir les marges' },
  { id: 'a0000001-0005-4000-8000-000000000003', module_id: 'rapports.stock', description: 'Voir les rapports de stock' },

  { id: 'a0000001-0006-4000-8000-000000000001', module_id: 'cashup.ouverture', description: 'Ouvrir une session de caisse' },
  { id: 'a0000001-0006-4000-8000-000000000002', module_id: 'cashup.cloture', description: 'Cloturer une session de caisse' },
  { id: 'a0000001-0006-4000-8000-000000000003', module_id: 'cashup.depense', description: 'Enregistrer des depenses' },

  { id: 'a0000001-0007-4000-8000-000000000001', module_id: 'admin.users', description: 'Gerer les utilisateurs' },
  { id: 'a0000001-0007-4000-8000-000000000002', module_id: 'admin.config', description: 'Modifier la configuration' },
  { id: 'a0000001-0007-4000-8000-000000000003', module_id: 'admin.import', description: 'Importer des donnees' },
];

// ─── Utilisateurs par défaut ───────────────────────────────────────
// PIN par défaut : "1234" (hashé avec PBKDF2 via pinHasher.ts)
// ⚠ CHANGER IMPÉRATIVEMENT au premier login !

export const SEED_USERS: {
  id: UUID;
  username: string;
  full_name: string;
  role: 'admin' | 'caissier';
}[] = [
  {
    id: 'b0000001-0001-4000-8000-000000000001',
    username: 'admin',
    full_name: 'Administrateur',
    role: 'admin',
  },
  {
    id: 'b0000001-0001-4000-8000-000000000002',
    username: 'caissier',
    full_name: 'Caissier',
    role: 'caissier',
  },
];

// ─── Grants Admin (toutes les permissions) ─────────────────────────

export function getAdminGrants(): { id: UUID; user_id: UUID; permission_id: UUID }[] {
  return SEED_PERMISSIONS.map((p) => ({
    id: crypto.randomUUID(),
    user_id: 'b0000001-0001-4000-8000-000000000001',
    permission_id: p.id,
  }));
}

// ─── Grants Caissier (permissions limitées) ────────────────────────

const CAISSIER_PERMISSIONS = [
  'caisse.vendre', 'caisse.encaisser', 'caisse.remise',
  'caisse.suspendre', 'caisse.devis',
  'stock.lecture',
  'catalogue.lecture',
  'clients.lecture', 'clients.edition',
  'cashup.ouverture', 'cashup.cloture', 'cashup.depense',
];

export function getCaissierGrants(): { id: UUID; user_id: UUID; permission_id: UUID }[] {
  return getGrantsForUser('b0000001-0001-4000-8000-000000000002', 'caissier');
}

/**
 * Grants d'un utilisateur selon son rôle (création via l'écran Utilisateurs).
 */
export function getGrantsForUser(
  userId: UUID,
  role: 'admin' | 'caissier'
): { id: UUID; user_id: UUID; permission_id: UUID }[] {
  const permMap = new Map(SEED_PERMISSIONS.map((p) => [p.module_id, p.id]));
  const moduleIds =
    role === 'admin' ? SEED_PERMISSIONS.map((p) => p.module_id) : CAISSIER_PERMISSIONS;
  return moduleIds.map((moduleId) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    permission_id: permMap.get(moduleId)!,
  }));
}

// ─── Catégories par défaut ─────────────────────────────────────────

export const SEED_CATEGORIES: { id: UUID; name: string; parent_id: null; sort_order: number }[] = [
  { id: 'c0000001-0001-4000-8000-000000000001', name: 'Câbles et cordons', parent_id: null, sort_order: 1 },
  { id: 'c0000001-0001-4000-8000-000000000002', name: 'Torches', parent_id: null, sort_order: 2 },
  { id: 'c0000001-0001-4000-8000-000000000003', name: 'Solaire', parent_id: null, sort_order: 3 },
  { id: 'c0000001-0001-4000-8000-000000000004', name: 'Audio', parent_id: null, sort_order: 4 },
  { id: 'c0000001-0001-4000-8000-000000000005', name: 'Électricité', parent_id: null, sort_order: 5 },
  { id: 'c0000001-0001-4000-8000-000000000006', name: 'Accessoires', parent_id: null, sort_order: 6 },
];

// ─── Configuration par défaut ──────────────────────────────────────

/**
 * Exécute le seed au premier démarrage (table users vide).
 * Les PIN par défaut sont hachés au moment de l'insertion
 * (bcrypt via Rust en prod, PBKDF2 Web Crypto en dev).
 */
export async function runSeed(db: Db): Promise<void> {
  const rows = await db.select<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users');
  if ((rows[0]?.cnt ?? 0) > 0) return;

  // Hacher les PIN AVANT la transaction (opération lente)
  const pinHashes = new Map<UUID, string>();
  for (const user of SEED_USERS) {
    pinHashes.set(user.id, await hashPin(DEFAULT_PIN));
  }

  await withTransaction(db, async (tx) => {
    for (const p of SEED_PERMISSIONS) {
      await tx.execute(
        'INSERT OR IGNORE INTO permissions (id, module_id, description) VALUES (?, ?, ?)',
        [p.id, p.module_id, p.description]
      );
    }

    for (const user of SEED_USERS) {
      await tx.execute(
        'INSERT INTO users (id, username, pin_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
        [user.id, user.username, pinHashes.get(user.id), user.full_name, user.role]
      );
    }

    for (const grant of [...getAdminGrants(), ...getCaissierGrants()]) {
      await tx.execute(
        'INSERT OR IGNORE INTO user_grants (id, user_id, permission_id) VALUES (?, ?, ?)',
        [grant.id, grant.user_id, grant.permission_id]
      );
    }

    for (const cat of SEED_CATEGORIES) {
      await tx.execute(
        'INSERT OR IGNORE INTO categories (id, name, parent_id, sort_order) VALUES (?, ?, ?, ?)',
        [cat.id, cat.name, cat.parent_id, cat.sort_order]
      );
    }

    for (const cfg of SEED_CONFIG) {
      await tx.execute(
        'INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)',
        [cfg.key, cfg.value]
      );
    }
  });

  console.log('[Seed] Données initiales insérées (admin/caissier, PIN 1234 — à changer).');
}

export const SEED_CONFIG: { key: string; value: string }[] = [
  { key: 'store_name', value: 'JIABY' },
  { key: 'store_address', value: '' },
  { key: 'store_phone', value: '' },
  { key: 'currency', value: 'MGA' },
  { key: 'receipt_header', value: 'JIABY — Matériel Électrique' },
  { key: 'receipt_footer', value: 'Merci de votre visite !' },
  { key: 'allow_negative_stock', value: 'false' },
  { key: 'default_tax_rate', value: '0' },
  { key: 'receipt_printer_type', value: 'windows_driver' },
  { key: 'receipt_printer_port', value: '' },
  { key: 'backup_enabled', value: 'true' },
  { key: 'sync_enabled', value: 'false' },
  { key: 'sync_server_url', value: 'http://localhost:3001' },
];
