import { describe, it, expect } from 'vitest';
import { prepareFinalize, checkStock, checkCreditLimit } from '../../src/core/domain/finalize';
import type { CartLine, CartPayment } from '../../src/core/domain/types';

const makeLine = (overrides: Partial<CartLine> = {}): CartLine => ({
  tempId: crypto.randomUUID(),
  itemId: 'item-1',
  name: 'Produit Test',
  quantity: 2,
  unitPrice: 10000,
  appliedPrice: 10000,
  discountPercent: null,
  discountAmount: null,
  lineTotal: 20000,
  tierApplied: 'detail',
  isKit: false,
  ...overrides,
});

const makePayment = (overrides: Partial<CartPayment> = {}): CartPayment => ({
  method: 'ESPECES',
  amount: 20000,
  reference: null,
  ...overrides,
});

describe('prepareFinalize', () => {
  it('S15: Vente simple en espèces', () => {
    const result = prepareFinalize({
      cartLines: [makeLine()],
      payments: [makePayment()],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: false,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.sale.total).toBe(20000);
    expect(result.sale.isQuote).toBe(0);
    expect(result.payments).toHaveLength(1);
  });

  it('S15: Panier vide = erreur', () => {
    const result = prepareFinalize({
      cartLines: [],
      payments: [makePayment()],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: false,
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('vide');
  });

  it('S15: Paiement insuffisant', () => {
    const result = prepareFinalize({
      cartLines: [makeLine({ lineTotal: 50000 })],
      payments: [makePayment({ amount: 20000 })],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: false,
    });

    expect(result.errors.some((e) => e.includes('insuffisant'))).toBe(true);
  });

  it('S15: MVola sans référence = erreur', () => {
    const result = prepareFinalize({
      cartLines: [makeLine()],
      payments: [makePayment({ method: 'MVOLA', reference: null })],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: false,
    });

    expect(result.errors.some((e) => e.includes('MVola'))).toBe(true);
  });

  it('S16: Trop-perçu espèces → rendu', () => {
    const result = prepareFinalize({
      cartLines: [makeLine({ lineTotal: 15000 })],
      payments: [makePayment({ method: 'ESPECES', amount: 20000 })],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: false,
    });

    expect(result.errors).toHaveLength(0);
    const cashPayment = result.payments.find((p) => p.method === 'ESPECES');
    expect(cashPayment?.changeGiven).toBe(5000);
  });

  it('S16: Trop-perçu non-espèces refusé', () => {
    const result = prepareFinalize({
      cartLines: [makeLine({ lineTotal: 10000 })],
      payments: [makePayment({ method: 'MVOLA', amount: 20000, reference: 'REF123' })],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: false,
    });

    expect(result.errors.some((e) => e.includes('Trop-perçu'))).toBe(true);
  });

  it('S17: Crédit sans client = erreur', () => {
    const result = prepareFinalize({
      cartLines: [makeLine()],
      payments: [makePayment({ method: 'CREDIT' })],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: false,
    });

    expect(result.errors.some((e) => e.includes('client'))).toBe(true);
  });

  it('S17: Crédit avec client = OK', () => {
    const result = prepareFinalize({
      cartLines: [makeLine()],
      payments: [makePayment({ method: 'CREDIT' })],
      customerId: 'customer-1',
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: false,
    });

    expect(result.errors).toHaveLength(0);
  });

  it('S21: Devis (pas de mouvement de stock)', () => {
    const result = prepareFinalize({
      cartLines: [makeLine()],
      payments: [],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: true,
      isReturn: false,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.sale.isQuote).toBe(1);
    expect(result.sale.status).toBe('SUSPENDED');
  });

  it('Paiements multiples (mixte)', () => {
    const result = prepareFinalize({
      cartLines: [makeLine({ lineTotal: 50000 })],
      payments: [
        makePayment({ method: 'ESPECES', amount: 30000 }),
        { method: 'MVOLA', amount: 20000, reference: 'MVO-001' },
      ],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: false,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.payments).toHaveLength(2);
  });
});

describe('checkStock', () => {
  it('Stock suffisant', () => {
    const shortages = checkStock(
      [makeLine({ quantity: 5 })],
      new Map([['item-1', 10]])
    );
    expect(shortages).toHaveLength(0);
  });

  it('S28: Rupture de stock détectée', () => {
    const shortages = checkStock(
      [makeLine({ quantity: 10 })],
      new Map([['item-1', 3]])
    );
    expect(shortages).toHaveLength(1);
    expect(shortages[0]!.requested).toBe(10);
    expect(shortages[0]!.available).toBe(3);
  });
});

describe('checkCreditLimit', () => {
  it('Crédit accepté sous le plafond', () => {
    expect(checkCreditLimit(50000, 100000, 30000)).toBe(true); // 80000 ≤ 100000
  });

  it('S19: Crédit refusé au-dessus du plafond', () => {
    expect(checkCreditLimit(80000, 100000, 30000)).toBe(false); // 110000 > 100000
  });

  it('Crédit exactement au plafond', () => {
    expect(checkCreditLimit(50000, 100000, 50000)).toBe(true);
  });
});
