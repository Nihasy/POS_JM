import { describe, it, expect } from 'vitest';
import {
  getTier,
  tierPrice,
  applyDiscount,
  lineTotal,
  saleTotal,
} from '../../src/core/domain/pricing';

/**
 * Scénarios S05, S09–S14 : Moteur de prix.
 *
 * S09: Palier semi-gros
 * S10: Palier gros
 * S11: Prix négocié (override)
 * S12: catalog_price vs applied_price
 * S13: lineTotal avec remise ligne
 * S14: Total vente avec remise globale
 */
describe('getTier — Palier', () => {
  it('S09: Semi-gros — qty ≥ seuil semi-gros mais < seuil gros', () => {
    // seuil semi-gros = 5, seuil gros = 20, qty = 6
    expect(getTier(6, 5, 20)).toBe('semi-gros');
  });

  it('S10: Gros — qty ≥ seuil gros', () => {
    expect(getTier(20, 5, 20)).toBe('gros');
    expect(getTier(50, 5, 20)).toBe('gros');
  });

  it('Détail — qty < seuil semi-gros', () => {
    expect(getTier(3, 5, 20)).toBe('detail');
  });

  it('Détail — seuils non définis', () => {
    expect(getTier(100, null, null)).toBe('detail');
  });

  it('Semi-gros — seul le seuil semi-gros est défini', () => {
    expect(getTier(10, 5, null)).toBe('semi-gros');
  });

  it('Gros prioritaire sur semi-gros', () => {
    // Si qty atteint les deux seuils, c'est gros
    expect(getTier(30, 5, 20)).toBe('gros');
  });
});

describe('tierPrice — Prix palier', () => {
  const item = {
    sellingPrice: 10000, // détail
    priceSemiGros: 8500,
    priceGros: 7000,
    qtySemiGros: 5,
    qtyGros: 20,
  };

  it('Prix détail', () => {
    const result = tierPrice(3, item.sellingPrice, item.priceSemiGros, item.priceGros, item.qtySemiGros, item.qtyGros);
    expect(result.price).toBe(10000);
    expect(result.tier).toBe('detail');
  });

  it('S09: Prix semi-gros à partir de 5 unités', () => {
    const result = tierPrice(6, item.sellingPrice, item.priceSemiGros, item.priceGros, item.qtySemiGros, item.qtyGros);
    expect(result.price).toBe(8500);
    expect(result.tier).toBe('semi-gros');
  });

  it('S10: Prix gros à partir de 20 unités', () => {
    const result = tierPrice(25, item.sellingPrice, item.priceSemiGros, item.priceGros, item.qtySemiGros, item.qtyGros);
    expect(result.price).toBe(7000);
    expect(result.tier).toBe('gros');
  });
});

describe('applyDiscount — Remise', () => {
  it('Remise en %', () => {
    // 10000 - 10% = 9000
    expect(applyDiscount(10000, 10, null)).toBe(9000);
  });

  it('Remise en Ar', () => {
    // 10000 - 500 = 9500
    expect(applyDiscount(10000, null, 500)).toBe(9500);
  });

  it('Remise % puis Ar', () => {
    // 10000 - 10% = 9000, puis -500 = 8500
    expect(applyDiscount(10000, 10, 500)).toBe(8500);
  });

  it('Remise ne peut pas rendre le prix négatif', () => {
    expect(applyDiscount(1000, 200, null)).toBe(0);
  });

  it('Pas de remise', () => {
    expect(applyDiscount(10000, null, null)).toBe(10000);
  });

  it('Remise zéro = pas de remise', () => {
    expect(applyDiscount(10000, 0, 0)).toBe(10000);
  });
});

describe('lineTotal — S13', () => {
  it('Ligne simple sans palier ni remise', () => {
    const result = lineTotal({
      quantity: 3,
      sellingPrice: 10000,
    });
    expect(result.catalogPrice).toBe(10000);
    expect(result.appliedPrice).toBe(10000);
    expect(result.lineTotal).toBe(30000);
    expect(result.tierApplied).toBe('detail');
  });

  it('S13: Ligne avec palier semi-gros et remise ligne', () => {
    const result = lineTotal({
      quantity: 6,
      sellingPrice: 10000,
      priceSemiGros: 8500,
      qtySemiGros: 5,
      discountPercent: 5,
    });
    // Prix semi-gros = 8500, remise 5% = 425, prix remisé = 8075
    // Total = 8075 × 6 = 48450
    expect(result.appliedPrice).toBe(8500);
    expect(result.lineTotal).toBe(48450);
  });

  it('S12: Prix négocié (override)', () => {
    const result = lineTotal({
      quantity: 2,
      sellingPrice: 10000,
      negotiatedPrice: 8000,
    });
    expect(result.catalogPrice).toBe(10000);
    expect(result.appliedPrice).toBe(8000);
    expect(result.tierApplied).toBeNull(); // Pas de palier si négocié
  });

  it('Ligne avec quantité décimale (vente au mètre)', () => {
    const result = lineTotal({
      quantity: 2.5,
      sellingPrice: 4000,
    });
    expect(result.lineTotal).toBe(10000); // 2.5 × 4000
  });
});

describe('saleTotal — S14', () => {
  it('Total sans remise globale', () => {
    const result = saleTotal([30000, 15000, 5000], null, null);
    expect(result.subtotal).toBe(50000);
    expect(result.total).toBe(50000);
  });

  it('S14: Remise globale en %', () => {
    const result = saleTotal([30000, 15000, 5000], 10, null);
    expect(result.subtotal).toBe(50000);
    expect(result.total).toBe(45000); // 50000 - 10%
  });

  it('Remise globale en Ar', () => {
    const result = saleTotal([30000, 15000, 5000], null, 2000);
    expect(result.total).toBe(48000);
  });

  it('Remise globale ne peut pas rendre le total négatif', () => {
    const result = saleTotal([1000], 200, null);
    expect(result.total).toBe(0);
  });
});
