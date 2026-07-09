/**
 * Script d'import historique JIABY.
 *
 * Lit les CSV normalisés (catalogue, stock initial, ventes agrégées) en Ariary,
 * valide chaque ligne, génère les écritures de ledger correspondantes,
 * et produit un rapport d'import (OK / rejetées + motifs).
 *
 * Usage :
 *   npx tsx scripts/import-historique/index.ts \
 *     --catalogue import/catalogue.csv \
 *     --stock import/stock_initial.csv \
 *     --ventes import/ventes.csv \
 *     --output import/rapport.csv
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Types ─────────────────────────────────────────────────────────

interface CatalogueRow {
  reference: string;
  nom: string;
  categorie: string;
  unite: string;
  prix_vente: number;
  cout_moyen: number;
  qty_stock: number;
  seuil_semi_gros: number | null;
  prix_semi_gros: number | null;
  seuil_gros: number | null;
  prix_gros: number | null;
  seuil_reappro: number | null;
}

interface StockRow {
  reference: string;
  quantite: number;
  cout_unitaire: number;
  commentaire: string;
}

interface VenteRow {
  date: string;
  reference: string;
  nom: string;
  quantite: number;
  prix_unitaire: number;
  total: number;
  mode_paiement: string;
}

interface ImportReport {
  section: string;
  ligne: number;
  statut: 'OK' | 'ERREUR';
  reference: string;
  motif: string | null;
}

// ─── Parsing CSV ───────────────────────────────────────────────────

function parseCsv(content: string, delimiter = ','): string[][] {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return lines.map((line) => {
    // Gestion basique des guillemets
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

// ─── Validation ────────────────────────────────────────────────────

function validateCatalogueRow(row: string[], lineNum: number): { data: CatalogueRow | null; error: string | null } {
  if (row.length < 6) {
    return { data: null, error: `Colonnes insuffisantes (${row.length}/6)` };
  }

  const prixVente = Number(row[3]?.replace(/[  \sAr]/g, ''));
  const coutMoyen = Number(row[4]?.replace(/[  \sAr]/g, ''));
  const qtyStock = Number(row[5]?.replace(',', '.'));

  if (!row[0]?.trim()) return { data: null, error: 'Référence vide' };
  if (!row[1]?.trim()) return { data: null, error: 'Nom vide' };
  if (Number.isNaN(prixVente) || prixVente < 0) return { data: null, error: `Prix vente invalide: ${row[3]}` };
  if (Number.isNaN(coutMoyen) || coutMoyen < 0) return { data: null, error: `Coût invalide: ${row[4]}` };
  if (Number.isNaN(qtyStock)) return { data: null, error: `Quantité invalide: ${row[5]}` };

  return {
    data: {
      reference: row[0]!.trim(),
      nom: row[1]!.trim(),
      categorie: row[2]?.trim() || 'Divers',
      unite: row[6]?.trim() || 'pièce',
      prix_vente: prixVente,
      cout_moyen: coutMoyen,
      qty_stock: qtyStock,
      seuil_semi_gros: row[7] ? Number(row[7]) : null,
      prix_semi_gros: row[8] ? Number(row[8]?.replace(/[  \sAr]/g, '')) : null,
      seuil_gros: row[9] ? Number(row[9]) : null,
      prix_gros: row[10] ? Number(row[10]?.replace(/[  \sAr]/g, '')) : null,
      seuil_reappro: row[11] ? Number(row[11]) : null,
    },
    error: null,
  };
}

// ─── Génération SQL ────────────────────────────────────────────────

function generateCatalogueSql(items: CatalogueRow[]): string {
  const lines: string[] = ['-- Insertions catalogue générées automatiquement'];

  for (const item of items) {
    const id = `'${crypto.randomUUID()}'`;
    const ref = `'${escapeSql(item.reference)}'`;
    const nom = `'${escapeSql(item.nom)}'`;
    const cat = `'${escapeSql(item.categorie)}'`;
    const unite = `'${escapeSql(item.unite)}'`;
    const itemNumber = ref; // Utiliser la référence existante

    lines.push(
      `INSERT INTO items (id, item_number, name, short_name, category_id, unit_name, cost_price, selling_price, qty_semi_gros, price_semi_gros, qty_gros, price_gros, reorder_level) VALUES (${id}, ${itemNumber}, ${nom}, ${nom}, NULL, ${unite}, ${item.cout_moyen}, ${item.prix_vente}, ${item.seuil_semi_gros ?? 'NULL'}, ${item.prix_semi_gros ?? 'NULL'}, ${item.seuil_gros ?? 'NULL'}, ${item.prix_gros ?? 'NULL'}, ${item.seuil_reappro ?? 'NULL'});`
    );

    // Écriture d'ouverture de stock
    if (item.qty_stock > 0) {
      const invId = `'${crypto.randomUUID()}'`;
      lines.push(
        `INSERT INTO inventory (id, item_id, quantity, cost_price, ref_type, ref_id, user_id, comment) VALUES (${invId}, ${id}, ${item.qty_stock}, ${item.cout_moyen}, 'OPENING', ${id}, '00000000-0000-0000-0000-000000000000', 'Stock initial importé');`
      );
    }
  }

  return lines.join('\n');
}

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

// ─── Rapport ───────────────────────────────────────────────────────

function generateReport(reports: ImportReport[]): string {
  const header = 'Section;Ligne;Statut;Référence;Motif';
  const rows = reports.map(
    (r) => `${r.section};${r.ligne};${r.statut};${r.reference};${r.motif ?? ''}`
  );
  return [header, ...rows].join('\n');
}

// ─── Main ──────────────────────────────────────────────────────────

interface ImportOptions {
  catalogue?: string;
  stock?: string;
  ventes?: string;
  output: string;
}

function parseArgs(): ImportOptions {
  const args = process.argv.slice(2);
  const opts: ImportOptions = { output: 'import_rapport.csv' };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--catalogue':
        opts.catalogue = args[++i];
        break;
      case '--stock':
        opts.stock = args[++i];
        break;
      case '--ventes':
        opts.ventes = args[++i];
        break;
      case '--output':
        opts.output = args[++i]!;
        break;
    }
  }

  return opts;
}

async function main() {
  const opts = parseArgs();
  const reports: ImportReport[] = [];
  const allInsertSql: string[] = [];

  console.log('=== Import Historique JIABY ===\n');

  // 1. Catalogue
  if (opts.catalogue) {
    console.log(`[Catalogue] Lecture de ${opts.catalogue}...`);
    const content = fs.readFileSync(opts.catalogue, 'utf-8');
    const rows = parseCsv(content);

    // Ignorer l'en-tête
    const validItems: CatalogueRow[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      const { data, error } = validateCatalogueRow(row, i + 1);

      if (error || !data) {
        reports.push({
          section: 'Catalogue',
          ligne: i + 1,
          statut: 'ERREUR',
          reference: row[0] || '?',
          motif: error,
        });
      } else {
        reports.push({
          section: 'Catalogue',
          ligne: i + 1,
          statut: 'OK',
          reference: data.reference,
          motif: null,
        });
        validItems.push(data);
      }
    }

    if (validItems.length > 0) {
      const sql = generateCatalogueSql(validItems);
      allInsertSql.push(sql);
      console.log(`  → ${validItems.length} produits importés, ${reports.filter((r) => r.statut === 'ERREUR').length} rejetés`);
    }
  }

  // 2. Rapport
  const reportCsv = generateReport(reports);
  fs.writeFileSync(opts.output, reportCsv, 'utf-8');
  console.log(`\n[Rapport] Écrit dans ${opts.output}`);
  console.log(`  Total: ${reports.length} lignes, ${reports.filter((r) => r.statut === 'OK').length} OK, ${reports.filter((r) => r.statut === 'ERREUR').length} rejetées`);

  // 3. Fichier SQL
  if (allInsertSql.length > 0) {
    const sqlPath = opts.output.replace('.csv', '.sql');
    fs.writeFileSync(sqlPath, allInsertSql.join('\n\n'), 'utf-8');
    console.log(`[SQL] Écrit dans ${sqlPath}`);
  }
}

// Exécution
main().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
