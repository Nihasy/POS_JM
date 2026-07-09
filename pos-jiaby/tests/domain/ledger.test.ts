import { describe, it, expect } from 'vitest';
import {
  computeQuantity,
  createLedgerEntry,
  createReversalEntries,
  verifyLedgerIntegrity,
  recalculateQuantities,
} from '../../src/core/domain/ledger';

describe('computeQuantity — Σ ledger', () => {
  it('Stock = somme des transactions', () => {
    const transactions = [
      { quantity: 10 },
      { quantity: 5 },
      { quantity: -3 },
    ];
    expect(computeQuantity(transactions)).toBe(12);
  });

  it('Stock zéro sans transactions', () => {
    expect(computeQuantity([])).toBe(0);
  });
});

describe('createLedgerEntry', () => {
  it('Crée une écriture correcte', () => {
    const entry = createLedgerEntry({
      id: 'uuid-1',
      itemId: 'item-1',
      quantity: 10,
      costPrice: 5000,
      refType: 'RECEIVING',
      refId: 'recv-1',
      userId: 'user-1',
      comment: 'Réception test',
    });

    expect(entry.item_id).toBe('item-1');
    expect(entry.quantity).toBe(10);
    expect(entry.cost_price).toBe(5000);
    expect(entry.ref_type).toBe('RECEIVING');
    expect(entry.comment).toBe('Réception test');
  });
});

describe('createReversalEntries — Contre-écritures', () => {
  it('Inverse les quantités', () => {
    const originals = [
      { id: 't1', item_id: 'item-1', quantity: 10, cost_price: 5000 },
      { id: 't2', item_id: 'item-2', quantity: -3, cost_price: 3000 },
    ];

    const reversals = createReversalEntries(originals, 'ADJUSTMENT', 'adj-1', 'user-1');

    expect(reversals).toHaveLength(2);
    expect(reversals[0]!.quantity).toBe(-10);
    expect(reversals[1]!.quantity).toBe(3); // −(−3) = 3
    expect(reversals[0]!.ref_type).toBe('ADJUSTMENT');
  });
});

describe('verifyLedgerIntegrity — S36', () => {
  it('Aucun écart quand tout est cohérent', () => {
    const inventoryByItem = new Map([
      ['item-1', 10],
      ['item-2', 5],
    ]);
    const itemQuantities = new Map([
      ['item-1', 10],
      ['item-2', 5],
    ]);

    const discrepancies = verifyLedgerIntegrity(inventoryByItem, itemQuantities);
    expect(discrepancies).toHaveLength(0);
  });

  it('Détecte un écart', () => {
    const inventoryByItem = new Map([['item-1', 10]]);
    const itemQuantities = new Map([['item-1', 8]]); // Écart de 2

    const discrepancies = verifyLedgerIntegrity(inventoryByItem, itemQuantities);
    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]!.diff).toBe(2);
  });

  it('Détecte un article manquant dans le cache', () => {
    const inventoryByItem = new Map([['item-1', 10]]);
    const itemQuantities = new Map(); // Cache vide

    const discrepancies = verifyLedgerIntegrity(inventoryByItem, itemQuantities);
    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]!.diff).toBe(10);
  });

  it('Détecte un article manquant dans le ledger', () => {
    const inventoryByItem = new Map();
    const itemQuantities = new Map([['item-1', 5]]); // Dans le cache mais pas dans le ledger

    const discrepancies = verifyLedgerIntegrity(inventoryByItem, itemQuantities);
    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]!.diff).toBe(-5);
  });
});

describe('recalculateQuantities', () => {
  it('Recalcule correctement le cache', () => {
    const inventory = [
      { item_id: 'item-1', quantity: 10 },
      { item_id: 'item-1', quantity: -2 },
      { item_id: 'item-2', quantity: 5 },
    ];

    const cache = recalculateQuantities(inventory);
    expect(cache.get('item-1')).toBe(8);
    expect(cache.get('item-2')).toBe(5);
  });
});
