import { describe, it, expect } from 'vitest';
import {
  saleNumber,
  quoteNumber,
  returnNumber,
  receivingNumber,
  itemNumber,
} from '../../src/core/domain/numbering';

describe('saleNumber', () => {
  it('V-2026-00001', () => {
    expect(saleNumber(2026, 1)).toBe('V-2026-00001');
  });

  it('V-2026-00042', () => {
    expect(saleNumber(2026, 42)).toBe('V-2026-00042');
  });

  it('Séquence à 5 chiffres', () => {
    expect(saleNumber(2026, 99999)).toBe('V-2026-99999');
  });
});

describe('quoteNumber', () => {
  it('D-2026-00001', () => {
    expect(quoteNumber(2026, 1)).toBe('D-2026-00001');
  });
});

describe('returnNumber', () => {
  it('R-2026-00001', () => {
    expect(returnNumber(2026, 1)).toBe('R-2026-00001');
  });
});

describe('receivingNumber', () => {
  it('REC-2026-00001', () => {
    expect(receivingNumber(2026, 1)).toBe('REC-2026-00001');
  });
});

describe('itemNumber', () => {
  it('Génère avec code catégorie', () => {
    expect(itemNumber('CABL', 42)).toBe('JIA-CABL-0042');
  });

  it('Sans catégorie = DIV', () => {
    expect(itemNumber(null, 1)).toBe('JIA-DIVX-0001');
  });

  it('Code trop long est tronqué', () => {
    expect(itemNumber('ELECTRICITE', 1)).toBe('JIA-ELEC-0001');
  });

  it('Code court est paddé', () => {
    expect(itemNumber('AB', 1)).toBe('JIA-ABXX-0001');
  });
});
