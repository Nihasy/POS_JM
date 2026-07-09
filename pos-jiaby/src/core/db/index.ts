/**
 * Accès à la base SQLite via @tauri-apps/plugin-sql.
 *
 * Mode WAL activé, toutes les écritures critiques passent par withTransaction().
 * Les repositories utilisent des requêtes préparées uniquement.
 */

// Notes : Ce module est conçu pour fonctionner avec Tauri.
// En environnement de test (Vitest), on mockera Database.

/**
 * Helper : exécuter un callback dans une transaction SQLite.
 * En cas d'erreur, rollback automatique.
 *
 * Usage :
 *   await withTransaction(db, async (tx) => {
 *     await tx.execute('INSERT INTO ...', [...]);
 *     await tx.execute('UPDATE ...', [...]);
 *   });
 */
export async function withTransaction<T>(
  _db: unknown,
  _fn: (tx: unknown) => Promise<T>
): Promise<T> {
  // Implémentation réelle avec Tauri SQL plugin
  // await db.execute('BEGIN IMMEDIATE');
  // try {
  //   const result = await fn(db);
  //   await db.execute('COMMIT');
  //   return result;
  // } catch (e) {
  //   await db.execute('ROLLBACK');
  //   throw e;
  // }
  throw new Error('withTransaction: non implémenté — nécessite le runtime Tauri');
}

/**
 * Ouvre la base SQLite en mode WAL.
 * À appeler au démarrage de l'application.
 */
export async function openDatabase(): Promise<unknown> {
  // const Database = (await import('@tauri-apps/plugin-sql')).default;
  // const db = await Database.load('sqlite:pos-jiaby.db');
  // await db.execute('PRAGMA journal_mode=WAL');
  // await db.execute('PRAGMA foreign_keys=ON');
  // return db;
  throw new Error('openDatabase: non implémenté — nécessite le runtime Tauri');
}

/**
 * Exécute les migrations au démarrage.
 */
export async function runMigrations(_db: unknown): Promise<void> {
  // Lecture de la table schema_version
  // Exécution des migrations manquantes dans l'ordre
  throw new Error('runMigrations: non implémenté');
}
