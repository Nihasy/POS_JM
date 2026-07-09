import { describe, it, expect } from 'vitest';
import {
  calculateVelocity,
  needsReorder,
  getItemsToReorder,
} from '../../src/core/domain/velocity';

describe('calculateVelocity — S31', () => {
  it('Calcule ventes/jour sur 30j', () => {
    const results = calculateVelocity([
      {
        itemId: 'item-1',
        itemName: 'Câble 2.5mm²',
        currentStock: 100,
        totalSold30d: 300, // 10/jour
        totalSold90d: 900, // 10/jour
      },
    ]);

    expect(results[0]!.salesPerDay30d).toBe(10);
    expect(results[0]!.salesPerDay90d).toBe(10);
    expect(results[0]!.daysOfStock30d).toBe(10); // 100 / 10
  });

  it('Stock infini si ventes nulles', () => {
    const results = calculateVelocity([
      {
        itemId: 'item-1',
        itemName: 'Produit sans vente',
        currentStock: 50,
        totalSold30d: 0,
        totalSold90d: 0,
      },
    ]);

    expect(results[0]!.daysOfStock30d).toBeNull();
    expect(results[0]!.daysOfStock90d).toBeNull();
  });

  it('Trie par urgence (stock le plus bas en premier)', () => {
    const results = calculateVelocity([
      {
        itemId: 'urgent',
        itemName: 'Stock critique',
        currentStock: 5,
        totalSold30d: 150, // 5/jour → 1 jour de stock
        totalSold90d: 450,
      },
      {
        itemId: 'ok',
        itemName: 'Stock correct',
        currentStock: 200,
        totalSold30d: 150, // 5/jour → 40 jours de stock
        totalSold90d: 450,
      },
    ]);

    expect(results[0]!.itemId).toBe('urgent');
    expect(results[1]!.itemId).toBe('ok');
  });
});

describe('needsReorder — S33', () => {
  it('Stock ≤ seuil → alerte', () => {
    expect(needsReorder(5, 10)).toBe(true);
  });

  it('Stock > seuil → pas d\'alerte', () => {
    expect(needsReorder(15, 10)).toBe(false);
  });

  it('Seuil non défini → pas d\'alerte', () => {
    expect(needsReorder(0, null)).toBe(false);
  });
});

describe('getItemsToReorder', () => {
  it('Filtre et trie par déficit', () => {
    const items = [
      { itemId: 'a', name: 'A', stock: 2, reorderLevel: 10 },
      { itemId: 'b', name: 'B', stock: 50, reorderLevel: 20 },
      { itemId: 'c', name: 'C', stock: 5, reorderLevel: 10 },
    ];

    const result = getItemsToReorder(items);
    expect(result).toHaveLength(2);
    expect(result[0]!.itemId).toBe('a'); // Déficit 8 > déficit 5
    expect(result[1]!.itemId).toBe('c');
  });
});
