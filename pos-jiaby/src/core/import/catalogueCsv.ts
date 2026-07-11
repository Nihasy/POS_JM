/**
 * Import CSV du catalogue — parseur et validation purs (sans DB).
 *
 * Format attendu (séparateur ; ou , — détecté automatiquement),
 * première ligne = en-têtes, insensible à la casse :
 *
 *   nom;nom_court;categorie;fournisseur;unite;conditionnement;
 *   qte_par_pack;prix_detail;cout;qte_semi_gros;prix_semi_gros;
 *   qte_gros;prix_gros;seuil_reappro;stock_initial
 *
 * Seuls `nom` et `prix_detail` sont obligatoires. Les montants sont
 * en Ariary entiers ; les quantités acceptent les décimales
 * uniquement pour les unités m et kg.
 */

import { isDecimalUnit } from '@/core/format';

export interface CatalogueCsvRow {
  name: string;
  shortName: string;
  categoryName: string | null;
  supplierName: string | null;
  unitName: string;
  packName: string | null;
  qtyPerPack: number | null;
  sellingPrice: number;
  costPrice: number;
  qtySemiGros: number | null;
  priceSemiGros: number | null;
  qtyGros: number | null;
  priceGros: number | null;
  reorderLevel: number | null;
  initialStock: number;
}

export interface CsvParseResult {
  rows: CatalogueCsvRow[];
  errors: { line: number; message: string }[];
}

export const CSV_HEADERS = [
  'nom',
  'nom_court',
  'categorie',
  'fournisseur',
  'unite',
  'conditionnement',
  'qte_par_pack',
  'prix_detail',
  'cout',
  'qte_semi_gros',
  'prix_semi_gros',
  'qte_gros',
  'prix_gros',
  'seuil_reappro',
  'stock_initial',
] as const;

/** Modèle CSV téléchargeable (en-têtes + une ligne d'exemple). */
export function csvTemplate(): string {
  return (
    CSV_HEADERS.join(';') +
    '\n' +
    'Ampoule LED E27 12W;Ampoule 12W;Électricité;Import CN Guangzhou;pièce;boîte;50;3500;1800;10;3000;50;2500;20;100\n'
  );
}

/** Nombre entier positif ou null. Chaîne vide → null. */
function parseIntField(
  raw: string,
  field: string,
  line: number,
  errors: CsvParseResult['errors']
): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
  if (Number.isNaN(n) || n < 0 || !Number.isInteger(n)) {
    errors.push({ line, message: `${field} : « ${raw} » n'est pas un entier positif.` });
    return null;
  }
  return n;
}

/** Quantité (décimale selon l'unité) ou null. */
function parseQtyField(
  raw: string,
  field: string,
  unitName: string,
  line: number,
  errors: CsvParseResult['errors']
): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
  if (Number.isNaN(n) || n < 0) {
    errors.push({ line, message: `${field} : « ${raw} » n'est pas une quantité valide.` });
    return null;
  }
  if (!isDecimalUnit(unitName) && !Number.isInteger(n)) {
    errors.push({
      line,
      message: `${field} : décimales interdites pour l'unité « ${unitName} ».`,
    });
    return null;
  }
  return n;
}

/**
 * Parse et valide le contenu d'un CSV catalogue.
 * Les lignes en erreur sont exclues de `rows` et détaillées dans `errors`.
 */
export function parseCatalogueCsv(text: string): CsvParseResult {
  const errors: CsvParseResult['errors'] = [];
  const rows: CatalogueCsvRow[] = [];

  const content = text.replace(/^﻿/, ''); // BOM éventuel
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) {
    return { rows, errors: [{ line: 0, message: 'Fichier vide.' }] };
  }

  // Détection du séparateur sur l'en-tête
  const headerLine = lines[0]!;
  const sep = headerLine.split(';').length >= headerLine.split(',').length ? ';' : ',';

  const headers = headerLine.split(sep).map((h) => h.trim().toLowerCase());
  const col = (name: (typeof CSV_HEADERS)[number]) => headers.indexOf(name);

  if (col('nom') === -1 || col('prix_detail') === -1) {
    return {
      rows,
      errors: [
        {
          line: 1,
          message: `En-têtes obligatoires manquants : « nom » et « prix_detail ». Attendu : ${CSV_HEADERS.join(sep)}`,
        },
      ],
    };
  }

  const seenNames = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = lines[i]!.split(sep).map((c) => c.trim());
    const get = (name: (typeof CSV_HEADERS)[number]) => {
      const idx = col(name);
      return idx === -1 ? '' : (cells[idx] ?? '');
    };

    const name = get('nom');
    if (!name) {
      errors.push({ line: lineNo, message: 'Le nom est obligatoire.' });
      continue;
    }
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) {
      errors.push({ line: lineNo, message: `Doublon dans le fichier : « ${name} ».` });
      continue;
    }

    const lineErrors: CsvParseResult['errors'] = [];
    const unitName = get('unite') || 'pièce';

    const rawPrice = get('prix_detail');
    const sellingPrice = parseIntField(rawPrice, 'prix_detail', lineNo, lineErrors);
    if (rawPrice === '') {
      lineErrors.push({ line: lineNo, message: 'prix_detail obligatoire.' });
    } else if (sellingPrice !== null && sellingPrice <= 0) {
      lineErrors.push({ line: lineNo, message: 'prix_detail doit être positif.' });
    }
    const costPrice = parseIntField(get('cout'), 'cout', lineNo, lineErrors) ?? 0;
    const priceSemiGros = parseIntField(get('prix_semi_gros'), 'prix_semi_gros', lineNo, lineErrors);
    const priceGros = parseIntField(get('prix_gros'), 'prix_gros', lineNo, lineErrors);
    const qtyPerPack = parseQtyField(get('qte_par_pack'), 'qte_par_pack', unitName, lineNo, lineErrors);
    const qtySemiGros = parseQtyField(get('qte_semi_gros'), 'qte_semi_gros', unitName, lineNo, lineErrors);
    const qtyGros = parseQtyField(get('qte_gros'), 'qte_gros', unitName, lineNo, lineErrors);
    const reorderLevel = parseQtyField(get('seuil_reappro'), 'seuil_reappro', unitName, lineNo, lineErrors);
    const initialStock =
      parseQtyField(get('stock_initial'), 'stock_initial', unitName, lineNo, lineErrors) ?? 0;

    // Cohérence des paliers (mêmes règles que le formulaire)
    if (priceSemiGros !== null && qtySemiGros === null) {
      lineErrors.push({ line: lineNo, message: 'prix_semi_gros fourni sans qte_semi_gros.' });
    }
    if (priceGros !== null && qtyGros === null) {
      lineErrors.push({ line: lineNo, message: 'prix_gros fourni sans qte_gros.' });
    }
    if (sellingPrice !== null && priceSemiGros !== null && priceSemiGros >= sellingPrice) {
      lineErrors.push({
        line: lineNo,
        message: 'prix_semi_gros doit être inférieur à prix_detail.',
      });
    }
    if (priceSemiGros !== null && priceGros !== null && priceGros >= priceSemiGros) {
      lineErrors.push({ line: lineNo, message: 'prix_gros doit être inférieur à prix_semi_gros.' });
    }
    if (qtySemiGros !== null && qtyGros !== null && qtyGros <= qtySemiGros) {
      lineErrors.push({ line: lineNo, message: 'qte_gros doit être supérieur à qte_semi_gros.' });
    }

    if (lineErrors.length > 0) {
      errors.push(...lineErrors);
      continue;
    }

    seenNames.add(nameKey);
    rows.push({
      name,
      shortName: get('nom_court') || name.slice(0, 30),
      categoryName: get('categorie') || null,
      supplierName: get('fournisseur') || null,
      unitName,
      packName: get('conditionnement') || null,
      qtyPerPack,
      sellingPrice: sellingPrice!,
      costPrice,
      qtySemiGros,
      priceSemiGros,
      qtyGros,
      priceGros,
      reorderLevel,
      initialStock,
    });
  }

  return { rows, errors };
}
