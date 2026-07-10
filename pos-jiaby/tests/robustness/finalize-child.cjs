/**
 * Processus enfant du test de robustesse (kill×50).
 *
 * Ouvre la base, démarre une transaction de finalisation de vente
 * (sales + sales_items + sales_payments + inventory), signale "READY"
 * puis attend SANS COMMITTER — le parent le tue en plein vol.
 *
 * Usage : node finalize-child.cjs <chemin-db>
 */

const Database = require('better-sqlite3');
const { randomUUID } = require('node:crypto');

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('Chemin de base manquant');
  process.exit(2);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const saleId = randomUUID();

// Transaction de finalisation — identique au chemin réel (tout ou rien)
db.exec('BEGIN IMMEDIATE');

db.prepare(
  `INSERT INTO sales (id, sale_number, customer_id, user_id, status, subtotal, total, is_quote, is_return)
   VALUES (?, ?, NULL, 'user-kill', 'COMPLETED', 15000, 15000, 0, 0)`
).run(saleId, `V-KILL-${randomUUID().slice(0, 8)}`);

db.prepare(
  `INSERT INTO sales_items (id, sale_id, item_id, name_snapshot, quantity, catalog_price,
    applied_price, discount_percent, discount_amount, line_total, cost_price_snapshot, tier_applied)
   VALUES (?, ?, 'item-kill', 'Produit kill-test', 1, 15000, 15000, NULL, NULL, 15000, 8000, 'detail')`
).run(randomUUID(), saleId);

db.prepare(
  `INSERT INTO sales_payments (id, sale_id, method, amount, reference, change_given)
   VALUES (?, ?, 'ESPECES', 15000, NULL, NULL)`
).run(randomUUID(), saleId);

db.prepare(
  `INSERT INTO inventory (id, item_id, quantity, cost_price, ref_type, ref_id, user_id, comment)
   VALUES (?, 'item-kill', -1, 8000, 'SALE', ?, 'user-kill', 'kill-test')`
).run(randomUUID(), saleId);

// Transaction ouverte, écritures en attente : on signale le parent
// qui va tuer le processus AVANT le COMMIT.
console.log('READY');

// Attente infinie (le COMMIT n'arrive jamais)
setInterval(() => {}, 1000);
