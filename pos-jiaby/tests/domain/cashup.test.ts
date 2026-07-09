import { describe, it, expect } from 'vitest';
import {
  calculateExpectedCash,
  prepareCashupClose,
  groupPaymentsByMethod,
  canSell,
} from '../../src/core/domain/cashup';

describe('calculateExpectedCash', () => {
  it('S30: Attendu = ouverture + ventes − rendus − dépenses', () => {
    const attendu = calculateExpectedCash(50000, 150000, 5000, 10000);
    // 50000 + 150000 - 5000 - 10000 = 185000
    expect(attendu).toBe(185000);
  });

  it('Zéro partout = ouverture', () => {
    expect(calculateExpectedCash(50000, 0, 0, 0)).toBe(50000);
  });
});

describe('prepareCashupClose', () => {
  it('Calcule l\'écart correctement', () => {
    const result = prepareCashupClose({
      openingAmount: 50000,
      cashSales: 150000,
      cashReturns: 5000,
      expenses: 10000,
      countedCash: 184000, // 1000 Ar de moins qu'attendu
      mvolaTotal: 30000,
      creditTotal: 20000,
    });

    expect(result.expectedCash).toBe(185000);
    expect(result.countedCash).toBe(184000);
    expect(result.difference).toBe(-1000); // Manque 1000 Ar
    expect(result.mvolaTotal).toBe(30000);
    expect(result.creditTotal).toBe(20000);
  });

  it('Caisse juste (écart zéro)', () => {
    const result = prepareCashupClose({
      openingAmount: 50000,
      cashSales: 100000,
      cashReturns: 0,
      expenses: 0,
      countedCash: 150000,
      mvolaTotal: 0,
      creditTotal: 0,
    });

    expect(result.difference).toBe(0);
  });

  it('Excédent (écart positif)', () => {
    const result = prepareCashupClose({
      openingAmount: 50000,
      cashSales: 100000,
      cashReturns: 0,
      expenses: 0,
      countedCash: 152000,
      mvolaTotal: 0,
      creditTotal: 0,
    });

    expect(result.difference).toBe(2000); // 2000 Ar en trop
  });
});

describe('groupPaymentsByMethod', () => {
  it('Regroupe correctement par méthode', () => {
    const groups = groupPaymentsByMethod([
      { method: 'ESPECES', amount: 50000 },
      { method: 'MVOLA', amount: 20000 },
      { method: 'ESPECES', amount: 30000 },
    ]);

    expect(groups.ESPECES).toBe(80000);
    expect(groups.MVOLA).toBe(20000);
    expect(groups.CREDIT).toBe(0);
  });
});

describe('canSell', () => {
  it('Vente bloquée sans session ouverte', () => {
    expect(canSell(false)).toBe(false);
  });

  it('Vente autorisée avec session ouverte', () => {
    expect(canSell(true)).toBe(true);
  });
});
