/**
 * Accès à la base SQLite via @tauri-apps/plugin-sql.
 *
 * Mode WAL activé, toutes les écritures critiques passent par withTransaction().
 * Les migrations sont appliquées côté Rust (lib.rs, add_migrations) au chargement.
 * Les repositories utilisent des requêtes préparées uniquement.
 */

/** Interface minimale de la DB (compatible plugin Tauri SQL et mocks de test) */
export interface Db {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

let _db: Db | null = null;

/** Détecte le runtime Tauri (backend Rust + plugin SQL disponibles). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Ouvre la base SQLite en mode WAL.
 * À appeler au démarrage de l'application (les migrations Rust
 * sont exécutées automatiquement par le plugin au premier load).
 *
 * Hors Tauri (navigateur : dev, E2E), bascule sur une base sql.js
 * en mémoire — voir browserDb.ts.
 */
export async function openDatabase(): Promise<Db> {
  if (_db) return _db;

  if (!isTauri()) {
    const { openBrowserDatabase } = await import('./browserDb');
    _db = await openBrowserDatabase();
    return _db;
  }

  const Database = (await import('@tauri-apps/plugin-sql')).default;
  const db = await Database.load('sqlite:pos-jiaby.db');
  await db.execute('PRAGMA journal_mode=WAL');
  await db.execute('PRAGMA foreign_keys=ON');
  await db.execute('PRAGMA busy_timeout=5000');

  _db = db as unknown as Db;
  return _db;
}

/**
 * Retourne la connexion ouverte (openDatabase doit avoir été appelé).
 */
export function getDb(): Db {
  if (!_db) {
    throw new Error('Base non initialisée — appeler openDatabase() au démarrage.');
  }
  return _db;
}

/** Pour les tests : injecter un mock. */
export function setDb(db: Db | null): void {
  _db = db;
}

/**
 * Helper : exécuter un callback dans une transaction SQLite.
 * BEGIN IMMEDIATE pour prendre le verrou d'écriture tout de suite ;
 * en cas d'erreur, rollback automatique — tout ou rien (règle n°6).
 */
export async function withTransaction<T>(
  db: Db,
  fn: (tx: Db) => Promise<T>
): Promise<T> {
  await db.execute('BEGIN IMMEDIATE');
  try {
    const result = await fn(db);
    await db.execute('COMMIT');
    return result;
  } catch (e) {
    try {
      await db.execute('ROLLBACK');
    } catch {
      // Le rollback peut échouer si la connexion est morte — l'erreur d'origine prime.
    }
    throw e;
  }
}

/**
 * Sauvegarde de la base : copie cohérente via VACUUM INTO.
 * Le dossier de destination (avec rotation 30 j) est préparé côté Rust.
 *
 * @returns Chemin du fichier de sauvegarde créé
 */
export async function backupDatabase(): Promise<string> {
  const db = getDb();
  const { invoke } = await import('@tauri-apps/api/core');

  // Crée le dossier de backups et purge les fichiers > 30 jours
  const backupDir = await invoke<string>('prepare_backup_dir');

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const target = `${backupDir}/pos-jiaby_${stamp}.db`.replace(/\\/g, '/');

  // VACUUM INTO produit une copie compacte et cohérente même en WAL
  await db.execute(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  return target;
}
