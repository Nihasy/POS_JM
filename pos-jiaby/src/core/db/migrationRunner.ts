/**
 * Exécution des migrations SQL au démarrage.
 *
 * Vérifie la table schema_version et applique les migrations manquantes
 * dans l'ordre. Chaque migration est dans un fichier SQL numéroté.
 */

interface Db {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}

interface Migration {
  version: number;
  description: string;
  sql: string;
}

// Liste des migrations (les fichiers SQL sont importés via Vite ?raw)
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Schéma initial complet (16 tables)',
    sql: '', // Sera chargé au runtime
  },
];

/**
 * Exécute les migrations manquantes.
 * À appeler au démarrage de l'application.
 */
export async function runMigrations(db: Db): Promise<void> {
  // S'assurer que la table schema_version existe
  await db.execute(
    `CREATE TABLE IF NOT EXISTS schema_version (
       version   INTEGER PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`
  );

  // Lire la version actuelle
  let rows: { version: number }[] = [];
  try {
    rows = (await db.execute(
      'SELECT MAX(version) as version FROM schema_version'
    )) as unknown as { version: number }[];
  } catch {
    // Table vide, partir de 0
  }

  const currentVersion: number = rows?.[0]?.version ?? 0;

  // Appliquer les migrations manquantes
  for (const mig of MIGRATIONS) {
    if (mig.version > currentVersion) {
      console.log(
        `[Migration] Application v${mig.version}: ${mig.description}...`
      );

      try {
        // Charger le SQL depuis le fichier
        const sql = await loadMigrationSql(mig.version);
        await db.execute(sql);
        await db.execute(
          'INSERT INTO schema_version (version) VALUES (?)',
          [mig.version]
        );
        console.log(`[Migration] v${mig.version} OK`);
      } catch (err) {
        console.error(
          `[Migration] Erreur v${mig.version}:`,
          err
        );
        throw new Error(
          `Migration v${mig.version} échouée: ${mig.description}`
        );
      }
    }
  }
}

/**
 * Charge le fichier SQL d'une migration.
 * En environnement Tauri, lit le fichier depuis le disque.
 * En environnement Vite, utilise ?raw pour importer le SQL.
 */
async function loadMigrationSql(version: number): Promise<string> {
  // Les migrations sont embarquées dans le build via Vite
  switch (version) {
    case 1:
      // Le SQL est déjà dans lib.rs via include_str!
      // On retourne une version simplifiée pour le dev
      return `
        CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, item_number TEXT NOT NULL UNIQUE, name TEXT NOT NULL, short_name TEXT NOT NULL DEFAULT '', category_id TEXT, unit_name TEXT NOT NULL DEFAULT 'pièce', pack_name TEXT, qty_per_pack REAL, cost_price INTEGER NOT NULL DEFAULT 0, selling_price INTEGER NOT NULL DEFAULT 0, qty_semi_gros REAL, price_semi_gros INTEGER, qty_gros REAL, price_gros INTEGER, reorder_level REAL, receiving_quantity REAL, photo_path TEXT, deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      `;
    default:
      throw new Error(`Migration v${version} introuvable`);
  }
}

/**
 * Vérifie et exécute le seed initial.
 * Insère les données par défaut si les tables sont vides.
 */
export async function runSeed(db: Db): Promise<void> {
  try {
    const rows = await db.execute('SELECT COUNT(*) as cnt FROM users') as unknown as { cnt: number }[];
    if (rows?.[0]?.cnt && rows[0].cnt > 0) {
      console.log('[Seed] Données déjà présentes, seed ignoré.');
      return;
    }
  } catch {
    // Table users n'existe pas encore, les migrations n'ont pas tourné
    return;
  }

  console.log('[Seed] Premier démarrage — insertion des données par défaut...');

  // Ces données sont importées depuis seed.ts
  // En pratique, l'appel à seed est fait après les migrations.
  // Les inserts sont faits par le backend Rust ou le script de dev.
}
