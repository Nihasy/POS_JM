import { describe, it, expect } from 'vitest';
import {
  saleNumber,
  quoteNumber,
  returnNumber,
  receivingNumber,
  itemNumber,
  labelCode,
  buildItemReference,
} from '../../src/core/domain/numbering';

describe('labelCode / buildItemReference', () => {
  it('code 4 lettres, accents retirés, complété par X', () => {
    expect(labelCode('Torches')).toBe('TORC');
    expect(labelCode('Électricité')).toBe('ELEC');
    expect(labelCode('TV')).toBe('TVXX');
    expect(labelCode('')).toBe('GENE');
    expect(labelCode(null)).toBe('GENE');
    expect(labelCode('Câbles 2,5mm²')).toBe('CABL');
  });

  it('référence = catégorie + nom court + séquence (sans préfixe)', () => {
    expect(buildItemReference('Torches', 'Lampe frontale', 12)).toBe('TORC-LAMP-012');
    expect(buildItemReference(null, 'Visseuse', 3)).toBe('GENE-VISS-003');
    expect(buildItemReference('Électricité', 'Prise TV', 137)).toBe('ELEC-PRIS-137');
  });
});

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
