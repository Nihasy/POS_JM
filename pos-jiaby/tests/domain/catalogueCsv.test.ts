import { describe, it, expect } from 'vitest';
import {
  parseCatalogueCsv,
  csvTemplate,
  CSV_HEADERS,
} from '../../src/core/import/catalogueCsv';

const HEADER = CSV_HEADERS.join(';');

describe('parseCatalogueCsv', () => {
  it('parse une ligne complète valide', () => {
    const csv =
      HEADER +
      '\nAmpoule 12W;Amp 12W;Électricité;Import CN;pièce;boîte;50;3500;1800;10;3000;50;2500;20;100\n';
    const { rows, errors } = parseCatalogueCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.name).toBe('Ampoule 12W');
    expect(r.shortName).toBe('Amp 12W');
    expect(r.categoryName).toBe('Électricité');
    expect(r.supplierName).toBe('Import CN');
    expect(r.unitName).toBe('pièce');
    expect(r.qtyPerPack).toBe(50);
    expect(r.sellingPrice).toBe(3500);
    expect(r.costPrice).toBe(1800);
    expect(r.qtySemiGros).toBe(10);
    expect(r.priceSemiGros).toBe(3000);
    expect(r.qtyGros).toBe(50);
    expect(r.priceGros).toBe(2500);
    expect(r.reorderLevel).toBe(20);
    expect(r.initialStock).toBe(100);
  });

  it('minimal : nom + prix_detail suffisent (défauts appliqués)', () => {
    const csv = 'nom;prix_detail\nVisseuse;45000\n';
    const { rows, errors } = parseCatalogueCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0]!.unitName).toBe('pièce');
    expect(rows[0]!.shortName).toBe('Visseuse');
    expect(rows[0]!.initialStock).toBe(0);
    expect(rows[0]!.categoryName).toBeNull();
  });

  it('séparateur virgule accepté', () => {
    const csv = 'nom,prix_detail,stock_initial\nScie,25000,4\n';
    const { rows, errors } = parseCatalogueCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0]!.sellingPrice).toBe(25000);
    expect(rows[0]!.initialStock).toBe(4);
  });

  it('en-têtes obligatoires manquants → erreur bloquante', () => {
    const { rows, errors } = parseCatalogueCsv('nom;prix\nX;100\n');
    expect(rows).toHaveLength(0);
    expect(errors[0]!.message).toContain('prix_detail');
  });

  it('prix non entier ou négatif rejeté, ligne exclue', () => {
    const csv = 'nom;prix_detail\nA;12,5\nB;-3\nC;3000\n';
    const { rows, errors } = parseCatalogueCsv(csv);
    expect(rows.map((r) => r.name)).toEqual(['C']);
    expect(errors).toHaveLength(2);
  });

  it('paliers incohérents rejetés (prix semi-gros ≥ détail, seuils inversés)', () => {
    const csv =
      'nom;prix_detail;qte_semi_gros;prix_semi_gros;qte_gros;prix_gros\n' +
      'A;3000;10;3500;50;2000\n' + // semi-gros >= détail
      'B;3000;50;2500;10;2000\n' + // qte_gros <= qte_semi_gros
      'C;3000;10;2500;;2000\n'; // prix_gros sans qte_gros
    const { rows, errors } = parseCatalogueCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it('décimales interdites pour les unités à la pièce, permises pour m', () => {
    const csv =
      'nom;prix_detail;unite;stock_initial\n' +
      'Pile;1000;pièce;2.5\n' +
      'Câble;4000;m;12.5\n';
    const { rows, errors } = parseCatalogueCsv(csv);
    expect(rows.map((r) => r.name)).toEqual(['Câble']);
    expect(rows[0]!.initialStock).toBe(12.5);
    expect(errors[0]!.message).toContain('décimales interdites');
  });

  it('doublons dans le fichier rejetés', () => {
    const csv = 'nom;prix_detail\nScie;1000\nscie;2000\n';
    const { rows, errors } = parseCatalogueCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors[0]!.message).toContain('Doublon');
  });

  it('le modèle généré se re-parse sans erreur', () => {
    const { rows, errors } = parseCatalogueCsv(csvTemplate());
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toContain('Ampoule');
  });
});
