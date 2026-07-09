import { describe, it, expect } from 'vitest';
import {
  formatAriary,
  parseAriary,
  formatAriaryCol,
  formatQty,
  parseQty,
  formatQtyWithUnit,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatTime,
} from '../../src/core/format';

// ─── formatAriary ──────────────────────────────────────────────────
describe('formatAriary', () => {
  it('formate 0 Ar', () => {
    expect(formatAriary(0)).toBe('0 Ar');
  });

  it('formate un petit montant', () => {
    expect(formatAriary(500)).toBe('500 Ar');
  });

  it('formate un montant avec milliers', () => {
    expect(formatAriary(1250000)).toBe('1 250 000 Ar');
  });

  it('formate un montant négatif avec signe moins mathématique', () => {
    expect(formatAriary(-500)).toBe('−500 Ar');
  });

  it('formate un gros montant (centaines de millions)', () => {
    expect(formatAriary(150000000)).toBe('150 000 000 Ar');
  });

  it('rejette un nombre décimal', () => {
    expect(() => formatAriary(1250.5)).toThrow('entier');
  });
});

// ─── parseAriary ───────────────────────────────────────────────────
describe('parseAriary', () => {
  it('parse "12500"', () => {
    expect(parseAriary('12500')).toBe(12500);
  });

  it('parse "12 500 Ar"', () => {
    expect(parseAriary('12 500 Ar')).toBe(12500);
  });

  it('parse "12500Ar"', () => {
    expect(parseAriary('12500Ar')).toBe(12500);
  });

  it('parse un montant avec espaces insécables', () => {
    expect(parseAriary('1 250 000 Ar')).toBe(1250000);
  });

  it('rejette une chaîne invalide', () => {
    expect(() => parseAriary('pas un montant')).toThrow();
  });
});

// ─── formatAriaryCol ───────────────────────────────────────────────
describe('formatAriaryCol', () => {
  it('formate sans suffixe Ar', () => {
    expect(formatAriaryCol(1250000)).toBe('1 250 000');
  });

  it('formate 0', () => {
    expect(formatAriaryCol(0)).toBe('0');
  });
});

// ─── formatQty ─────────────────────────────────────────────────────
describe('formatQty', () => {
  it('formate un entier', () => {
    expect(formatQty(3)).toBe('3');
  });

  it('formate une décimale', () => {
    expect(formatQty(2.5)).toBe('2,5');
  });

  it('arrondit à 1 décimale', () => {
    expect(formatQty(1.234)).toBe('1,2');
  });

  it('arrondit vers le haut', () => {
    expect(formatQty(1.25)).toBe('1,3');
  });

  it('formate zéro', () => {
    expect(formatQty(0)).toBe('0');
  });

  it('supprime le ",0" pour un entier', () => {
    expect(formatQty(5.0)).toBe('5');
  });
});

// ─── parseQty ──────────────────────────────────────────────────────
describe('parseQty', () => {
  it('parse un entier', () => {
    expect(parseQty('3')).toBe(3);
  });

  it('parse une décimale avec virgule fr', () => {
    expect(parseQty('2,5')).toBe(2.5);
  });

  it('parse une décimale avec point', () => {
    expect(parseQty('2.5')).toBe(2.5);
  });

  it('rejette une valeur négative', () => {
    expect(() => parseQty('-1')).toThrow();
  });
});

// ─── formatQtyWithUnit ─────────────────────────────────────────────
describe('formatQtyWithUnit', () => {
  it('singulier pièce', () => {
    expect(formatQtyWithUnit(1, 'pièce')).toBe('1 pièce');
  });

  it('pluriel pièces', () => {
    expect(formatQtyWithUnit(3, 'pièce')).toBe('3 pièces');
  });

  it('mètre (jamais de pluriel)', () => {
    expect(formatQtyWithUnit(2.5, 'm')).toBe('2,5 m');
  });
});

// ─── dates ─────────────────────────────────────────────────────────
describe('dates', () => {
  it('formatDate', () => {
    expect(formatDate(new Date('2026-07-09'))).toBe('09/07/2026');
  });

  it('formatDateLong', () => {
    expect(formatDateLong(new Date('2026-07-09'))).toBe('09 juillet 2026');
  });

  it('formatDateTime', () => {
    expect(formatDateTime(new Date('2026-07-09T14:30:00'))).toBe('09/07/2026 14:30');
  });

  it('formatTime', () => {
    expect(formatTime(new Date('2026-07-09T14:30:00'))).toBe('14:30');
  });
});
