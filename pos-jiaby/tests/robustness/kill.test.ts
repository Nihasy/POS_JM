/**
 * Test de robustesse coupure (stratégie globale, point 4 du plan) :
 * kill du process pendant `finalize()` × 50 itérations → base jamais
 * corrompue (WAL), aucune vente partielle.
 *
 * Chaque itération lance un processus enfant (finalize-child.cjs) qui
 * ouvre une transaction de vente complète puis attend sans committer ;
 * le parent le tue (SIGKILL) et vérifie que la base reste intègre et
 * qu'aucune écriture partielle n'a été persistée.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dir = dirname(fileURLToPath(import.meta.url));
const CHILD_SCRIPT = join(__dir, 'finalize-child.cjs');
const MIGRATION_SQL = readFileSync(
  join(__dir, '../../src/core/db/migrations/001_init.sql'),
  'utf-8'
);

const ITERATIONS = 50;

let workDir: string;
let dbPath: string;

/** Lance l'enfant, attend qu'il soit en pleine transaction, le tue. */
function killDuringFinalize(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD_SCRIPT, dbPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Enfant jamais prêt (timeout)'));
    }, 15_000);

    let out = '';
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes('READY')) {
        clearTimeout(timeout);
        // Transaction ouverte, écritures non commitées → kill brutal
        child.kill('SIGKILL');
      }
    });

    let err = '';
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString();
    });

    child.on('exit', () => {
      clearTimeout(timeout);
      if (!out.includes('READY')) {
        reject(new Error(`Enfant mort avant READY : ${err || '(pas de stderr)'}`));
      } else {
        resolve();
      }
    });
    child.on('error', reject);
  });
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'jiaby-kill-'));
  dbPath = join(workDir, 'kill-test.db');

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(MIGRATION_SQL);

  // Article référencé par les transactions enfants (contraintes FK)
  // + vente témoin COMMITÉE : elle doit survivre à tous les kills
  db.exec(`
    INSERT INTO items (id, item_number, name, cost_price, selling_price)
    VALUES ('item-kill', 'JIA-KILL-0001', 'Produit kill-test', 8000, 15000);
    INSERT INTO sales (id, sale_number, customer_id, user_id, status, subtotal, total, is_quote, is_return)
    VALUES ('sale-temoin', 'V-2026-00001', NULL, 'user-1', 'COMPLETED', 10000, 10000, 0, 0);
  `);
  db.close();
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe(`Robustesse coupure — kill × ${ITERATIONS} pendant finalize`, () => {
  it(
    'la base n’est jamais corrompue et aucune vente partielle ne persiste',
    { timeout: 300_000 },
    async () => {
      for (let i = 0; i < ITERATIONS; i++) {
        await killDuringFinalize();

        // Réouverture après le crash : SQLite rejoue/annule le WAL
        const db = new Database(dbPath);

        const integrity = db.pragma('integrity_check') as { integrity_check: string }[];
        expect(integrity[0]?.integrity_check, `intégrité après kill #${i + 1}`).toBe('ok');

        // Tout ou rien : seule la vente témoin existe, aucune écriture partielle
        const sales = db.prepare('SELECT COUNT(*) as cnt FROM sales').get() as { cnt: number };
        const items = db.prepare('SELECT COUNT(*) as cnt FROM sales_items').get() as { cnt: number };
        const payments = db.prepare('SELECT COUNT(*) as cnt FROM sales_payments').get() as { cnt: number };
        const ledger = db.prepare('SELECT COUNT(*) as cnt FROM inventory').get() as { cnt: number };

        expect(sales.cnt, `ventes après kill #${i + 1}`).toBe(1);
        expect(items.cnt, `lignes après kill #${i + 1}`).toBe(0);
        expect(payments.cnt, `paiements après kill #${i + 1}`).toBe(0);
        expect(ledger.cnt, `ledger après kill #${i + 1}`).toBe(0);

        db.close();
      }
    }
  );
});
