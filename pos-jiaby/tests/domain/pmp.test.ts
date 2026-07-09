import { describe, it, expect } from 'vitest';
import { calculatePmp, calculateStockValue, calculateCogs, calculateMargin } from '../../src/core/domain/pmp';

/**
 * Scénarios S01–S04 : PMP pondéré.
 *
 * S01: Premier achat → PMP = coût unitaire
 * S02: Deuxième achat → PMP pondéré
 * S03: Achats successifs avec coûts différents
 * S04: Cas limite — stock zéro, quantités décimales
 */
describe('PMP — S01–S04', () => {
  it('S01: Premier achat — stock=0, PMP=0, 10u à 5000 Ar', () => {
    const pmp = calculatePmp(0, 0, 10, 5000);
    expect(pmp).toBe(5000);
  });

  it('S02: Deuxième achat — (10×5000 + 5×6000) / 15 = 5333', () => {
    const pmp = calculatePmp(10, 5000, 5, 6000);
    // (50000 + 30000) / 15 = 5333.33 → 5333
    expect(pmp).toBe(5333);
  });

  it('S03: Troisième achat — (15×5333 + 20×4500) / 35', () => {
    // stock=15, PMP=5333, reçu 20 à 4500
    // (15*5333 + 20*4500) / 35 = (79995 + 90000) / 35 = 169995/35 = 4857
    const pmp = calculatePmp(15, 5333, 20, 4500);
    expect(pmp).toBe(4857);
  });

  it('S04: Cas limite — quantité reçue nulle rejetée', () => {
    expect(() => calculatePmp(10, 5000, 0, 6000)).toThrow('positive');
  });

  it('S04: Cas limite — quantité reçue négative rejetée', () => {
    expect(() => calculatePmp(10, 5000, -5, 6000)).toThrow('positive');
  });

  it('S04: Cas limite — coût négatif rejeté', () => {
    expect(() => calculatePmp(10, 5000, 5, -100)).toThrow('négatif');
  });

  it('Achat avec stock décimal', () => {
    // stock=2.5, PMP=4000, reçu 3.5 à 5000
    // (2.5*4000 + 3.5*5000) / (2.5+3.5) = (10000+17500)/6 = 4583.33 → 4583
    const pmp = calculatePmp(2.5, 4000, 3.5, 5000);
    expect(pmp).toBe(4583);
  });
});

describe('Valorisation stock', () => {
  it('Stock vide = 0', () => {
    expect(calculateStockValue([])).toBe(0);
  });

  it('Somme qté × PMP', () => {
    const items = [
      { quantity: 10, costPrice: 5000 },
      { quantity: 5, costPrice: 3000 },
    ];
    expect(calculateStockValue(items)).toBe(10 * 5000 + 5 * 3000);
  });
});

describe('COGS et marge', () => {
  it('COGS = qté × coût', () => {
    expect(calculateCogs(3, 5000)).toBe(15000);
  });

  it('Marge = prix vente − COGS', () => {
    expect(calculateMargin(20000, 15000)).toBe(5000);
  });
});
