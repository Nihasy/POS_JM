import { describe, it, expect } from 'vitest';
import {
  validatePinFormat,
  getPinHasher,
} from '../../src/modules/auth/pinHasher';

describe('validatePinFormat', () => {
  it('PIN trop court (< 4)', () => {
    expect(validatePinFormat('123')).toBeTruthy();
  });

  it('PIN trop long (> 6)', () => {
    expect(validatePinFormat('1234567')).toBeTruthy();
  });

  it('PIN avec lettres rejeté', () => {
    expect(validatePinFormat('12ab')).toBeTruthy();
  });

  it('PIN valide (4 chiffres)', () => {
    expect(validatePinFormat('1234')).toBeNull();
  });

  it('PIN valide (6 chiffres)', () => {
    expect(validatePinFormat('123456')).toBeNull();
  });
});

describe('pinHasher', () => {
  it('Hash et vérifie un PIN correct', async () => {
    const hasher = getPinHasher();
    const hash = await hasher.hash('1234');
    expect(hash).toMatch(/^pbkdf2:/);

    const valid = await hasher.verify('1234', hash);
    expect(valid).toBe(true);
  });

  it('Rejette un PIN incorrect', async () => {
    const hasher = getPinHasher();
    const hash = await hasher.hash('1234');
    const valid = await hasher.verify('5678', hash);
    expect(valid).toBe(false);
  });

  it('Deux hashs du même PIN sont différents (salt aléatoire)', async () => {
    const hasher = getPinHasher();
    const hash1 = await hasher.hash('1234');
    const hash2 = await hasher.hash('1234');
    expect(hash1).not.toBe(hash2);

    // Les deux doivent être valides
    expect(await hasher.verify('1234', hash1)).toBe(true);
    expect(await hasher.verify('1234', hash2)).toBe(true);
  });

  it('Rejette un hash de format inconnu', async () => {
    const hasher = getPinHasher();
    const valid = await hasher.verify('1234', 'bcrypt:$2b$10$...');
    expect(valid).toBe(false);
  });
});
